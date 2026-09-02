import { logDate, parseLog } from "../src/log";
import { absoluteTimes, placeShots } from "../src/screenshots";
import { listShots, resolveShot } from "../src/shot-folder";
import { findLog, findScreenshotDir } from "../src/windows-path";
import { checkData } from "../src/data-check";
import { publish } from "../src/publish";
import { EVENT_PATH, PLAYERS_PATH } from "../src/storage";
import { parseShowOrder } from "../site/rules";
import { defaultMessage, suggestShowName } from "../site/admin-model";
import { ReadQueue } from "../src/ocr/queue";
import { readShot } from "../src/ocr/read";
import { cacheKey, loadCache, saveCache } from "../src/ocr/cache";
import { fillsFor } from "../src/ocr/autofill";
import { identify } from "../src/ocr/recognizers";
import { frameFrom } from "../src/ocr/frame";
import { clipKey, momentKey, momentsIn, showClips } from "../src/capture/moments";
import { parseSegments, type Segment } from "../src/capture/segments";
import { recordArgv } from "../src/capture/command";
import { captureFolders, captureSettings, runFolder } from "../src/capture/paths";
import { toWindows } from "../src/capture/win-path";
import { Recorder } from "../src/capture/recorder";
import { Ledger, type LedgerState } from "../src/capture/ledger";
import { Serial } from "../src/capture/serial";
import { captureMoment, cutShowClip } from "../src/capture/pipeline";
import { mkdir } from "node:fs/promises";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { showNameNow, type LiveNow } from "../src/live";
import type { ParsedShow } from "../src/log";
import type { Players, TournamentEvent } from "../src/types";
import type { Shot, ShotSource } from "../src/screenshots";

const SHOWS_PATH = "data/shows.json";
const CACHE_PATH = ".ocr-cache/reads.json";
const LEDGER_PATH = ".ocr-cache/captured.json";

/**
 * Off by default: development saves the same files the event does, and every save would otherwise
 * land on the public board. `bun run live` turns it on for the night itself.
 */
const AUTO_PUBLISH = Bun.argv.includes("--publish");

/**
 * On unless refused: a show that was not recorded cannot be recovered, and remembering a flag is
 * exactly the thing that gets forgotten on the night. `--no-record` is for working on the admin
 * without grabbing a monitor.
 */
const RECORD = !Bun.argv.includes("--no-record");

/**
 * The log is a convenience: it prefills rounds. Losing it must not stop the admin loading.
 *
 * `date` is the day the log was written, which is what every stamp in it is measured from. It
 * beats the event's own date, which is typed by hand and is a day out as soon as a session runs
 * past midnight — and a day out puts every capture in the last show that is still open.
 */
async function parsedShows(
  logPath: string | undefined,
): Promise<{ shows: ParsedShow[]; date?: string }> {
  if (!logPath) return { shows: [] };
  try {
    const text = await Bun.file(logPath).text();
    const date = logDate(text);
    return { shows: parseLog(text), ...(date === undefined ? {} : { date }) };
  } catch {
    return { shows: [] };
  }
}

const capture = await captureSettings(process.env);
const folders = captureFolders(capture.dir);

/** Which folder a capture lives in. ShareX's is only ever read; the frames are ours to write. */
async function rootFor(source: ShotSource): Promise<string | undefined> {
  if (source === "auto") return RECORD ? folders.captures : undefined;
  return findScreenshotDir();
}

/** Screenshots are a reading aid: a missing or unreadable folder must not stop the admin loading. */
async function placed(dir: string | undefined, shows: ParsedShow[], date: string) {
  const month = date.slice(0, 7);
  const shots: Shot[] = [];
  for (const [root, source] of [
    [dir, "sharex"],
    [RECORD ? folders.captures : undefined, "auto"],
  ] as const) {
    if (!root) continue;
    try {
      shots.push(...(await listShots(root, month, source)));
    } catch {
      // One unreadable root must not cost the other.
    }
  }
  try {
    return placeShots(shots, shows, date);
  } catch {
    return [];
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function writeJson(
  path: string,
  request: Request,
  describe: (body: never) => string,
): Promise<Response> {
  const body = await request.json();
  await Bun.write(path, `${JSON.stringify(body, null, 2)}\n`);

  // Publishing commits the whole of data/, so a save that another is about to follow asks with
  // `?publish=0` and the pair lands in one commit rather than two.
  const quiet = new URL(request.url).searchParams.get("publish") === "0";
  if (!AUTO_PUBLISH || quiet) return json({ saved: path });

  const subject = describe(body as never);
  const published = await publish(subject);
  console.log(`${subject} — ${published.message}`);
  return json({ saved: path, published });
}

const reader = new ReadQueue(readShot);
Object.assign(reader.cache(), await loadCache(CACHE_PATH));
setInterval(() => void saveCache(CACHE_PATH, reader.cache()), 10_000);

/** Reading is a convenience: a capture that cannot be read must not stop the admin loading. */
function queueReads(dir: string | undefined, shots: Shot[]): void {
  const roots: Record<ShotSource, string | undefined> = {
    sharex: dir,
    auto: RECORD ? folders.captures : undefined,
  };
  reader.offer(
    shots.flatMap((shot) => {
      const root = roots[shot.source];
      const path = root ? resolveShot(root, shot.file) : undefined;
      return path ? [{ key: cacheKey(shot.file, shot.takenAt), path }] : [];
    }),
  );
}

/** Only what has already been read. A capture still in the queue turns up on a later poll. */
function readsFor(shots: Shot[]) {
  const cache = reader.cache();
  return Object.fromEntries(
    shots.flatMap((shot) => {
      const read = cache[cacheKey(shot.file, shot.takenAt)];
      return read ? [[shot.file, read] as const] : [];
    }),
  );
}

const ledger = new Ledger(
  await Bun.file(LEDGER_PATH)
    .json()
    .then((state) => state as LedgerState)
    .catch(() => undefined),
);
const captureJobs = new Serial();

async function runFfmpeg(argv: string[]) {
  const child = Bun.spawn(argv, { stdout: "ignore", stderr: "pipe" });
  const stderr = await new Response(child.stderr).text();
  return { ok: (await child.exited) === 0, stderr };
}

let lastRun: string | undefined;

/**
 * A folder per ffmpeg spawn, so a restart or a crash-respawn never numbers over the last one.
 *
 * The spawn before is dropped when it caught nothing: an input that will not open dies in under
 * three seconds and is retried at once, which would otherwise leave an empty folder every time.
 * Synchronous because the recorder asks for the folder in the same breath as it spawns.
 */
function newRun(): string {
  if (lastRun && !readdirSync(lastRun).some((name) => name.endsWith(".mkv"))) {
    rmSync(lastRun, { recursive: true, force: true });
  }
  const base = `${folders.segments}/${runFolder(Date.now())}`;
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  lastRun = dir;
  return dir;
}

const recorder = new Recorder({
  argvFor: (audio, runDir) =>
    recordArgv({
      ffmpeg: capture.ffmpeg!,
      output: capture.output,
      ...(audio && capture.audioDevice ? { audioDevice: capture.audioDevice } : {}),
      dir: toWindows(runDir),
      fps: 30,
      segmentSeconds: 30,
    }),
  newRun,
  spawn: (argv) => {
    const child = Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" });
    return { exited: child.exited, kill: () => child.kill() };
  },
  now: () => Date.now(),
});

/**
 * Every run's segments, oldest first. The muxer only lists a segment once it closes, so the one
 * recording now is never in here, and a run that died before closing one contributes nothing.
 */
async function segmentsNow(): Promise<Segment[]> {
  const segments: Segment[] = [];
  for (const run of recorder.runs()) {
    const csv = await Bun.file(`${run.dir}/segments.csv`)
      .text()
      .catch(() => "");
    segments.push(...parseSegments(csv, run.startedAt, run.dir));
  }
  return segments;
}

function clipName(shows: ParsedShow[], showIndex: number, date: string): string {
  const slug = suggestShowName(shows, showIndex)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${date}-show-${String(showIndex + 1).padStart(2, "0")}-${slug}`;
}

/**
 * Frames are found by the clock stamp inside a log line, never by when the line was noticed, so a
 * log that flushed late still names the right frame.
 */
async function sweepCaptures(): Promise<void> {
  const { shows, date } = await parsedShows(await findLog());
  if (shows.length === 0) return;
  const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
  const day = date ?? event.date;
  const segments = await segmentsNow();
  if (segments.length === 0) return;

  for (const moment of momentsIn(shows, day)) {
    if (!ledger.pending(momentKey(moment))) continue;
    captureJobs.add(async () => {
      await captureMoment(moment, segments, ledger, {
        ffmpeg: capture.ffmpeg!,
        scratchDir: folders.scratch,
        captureDir: folders.captures,
        run: runFfmpeg,
        frameOf: frameFrom,
        screenOf: identify,
        now: () => Date.now(),
      });
    });
  }

  for (const clip of showClips(shows, day)) {
    if (!ledger.pending(clipKey(clip))) continue;
    const name = clipName(shows, clip.showIndex, day);
    captureJobs.add(async () => {
      const cut = await cutShowClip(clip, segments, name, ledger, {
        ffmpeg: capture.ffmpeg!,
        scratchDir: folders.scratch,
        showsDir: folders.shows,
        run: runFfmpeg,
      });
      if (cut?.gapped) console.log(`${name}.mp4 — a recording died inside it, so the clip jumps`);
    });
  }
}

if (RECORD && capture.ffmpeg) {
  for (const dir of Object.values(folders)) await mkdir(dir, { recursive: true });
  recorder.start();
  setInterval(() => void sweepCaptures().catch(() => {}), 5_000);
  setInterval(
    () => void Bun.write(LEDGER_PATH, `${JSON.stringify(ledger.state(), null, 2)}\n`),
    10_000,
  );
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/state") {
      const logPath = await findLog();
      const shotDir = await findScreenshotDir();
      const { shows, date } = await parsedShows(logPath);
      const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
      const day = date ?? event.date;
      const shots = await placed(shotDir, shows, day);
      const times = absoluteTimes(shows, day);
      queueReads(shotDir, shots);
      const players = (await Bun.file(PLAYERS_PATH).json()) as Players;
      const roster = players.players.flatMap((player) =>
        player.ingame && player.joined !== false ? [player.ingame] : [],
      );

      return json({
        players,
        event,
        showNames: Object.keys(
          ((await Bun.file(SHOWS_PATH).json()) as { shows: Record<string, unknown> }).shows,
        ).sort(),
        order: parseShowOrder(await Bun.file("docs/rules.md").text()),
        logPath: logPath ?? null,
        shows,
        times,
        shotDir: shotDir ?? null,
        shots,
        fills: fillsFor(shots, readsFor(shots), roster, times, event.shows),
        autoPublish: AUTO_PUBLISH,
        capture: RECORD ? recorder.status() : null,
        problems: await checkData(),
      });
    }

    if (pathname === "/api/shot") {
      const params = new URL(request.url).searchParams;
      const file = params.get("f");
      const dir = await rootFor(params.get("s") === "auto" ? "auto" : "sharex");
      if (!dir || !file) return new Response("Not found", { status: 404 });
      const path = resolveShot(dir, file);
      if (!path) return new Response("Forbidden", { status: 403 });
      const image = Bun.file(path);
      if (!(await image.exists())) return new Response("Not found", { status: 404 });
      return new Response(image);
    }

    /**
     * Reads one show's captures again. The cache is keyed by name and mtime, so a change to the
     * reader leaves every capture answering with what the old one made of it.
     */
    if (request.method === "POST" && pathname === "/api/reread") {
      const { showIndex } = (await request.json()) as { showIndex: number };
      const { shows, date } = await parsedShows(await findLog());
      const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
      const shotDir = await findScreenshotDir();
      const shots = (await placed(shotDir, shows, date ?? event.date)).filter(
        (shot) => shot.showIndex === showIndex,
      );
      reader.forget(shots.map((shot) => cacheKey(shot.file, shot.takenAt)));
      queueReads(shotDir, shots);
      return json({ rereading: shots.length });
    }

    if (request.method === "PUT" && pathname === "/api/players") {
      return writeJson(PLAYERS_PATH, request, () => "data: update players");
    }
    if (request.method === "PUT" && pathname === "/api/event") {
      return writeJson(EVENT_PATH, request, (saved: TournamentEvent) => defaultMessage(saved));
    }

    /**
     * What the game has on screen, which only this machine's log knows. GitHub Pages has no such
     * file, so the published board falls back to what was recorded.
     */
    if (pathname === "/live.json") {
      const { shows: played } = await parsedShows(await findLog());
      const playing = played.at(-1);
      if (!playing) return json(null);

      const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
      const round = playing.rounds.at(-1);

      // A recorded show without winners is the one still being typed in; anything else means the
      // lobby has moved on to a show nobody has written down yet.
      const last = event.shows.at(-1);
      const typing = last !== undefined && !last.winners?.length;
      const index = typing ? event.shows.length - 1 : event.shows.length;

      const live: LiveNow = {
        show: showNameNow(event, index, suggestShowName(played, played.length - 1)),
        showNumber: index + 1,
        round: playing.rounds.length,
        map: round?.name ?? null,
        type: round ? (round.isFinal ? "final" : round.type) : null,
        startedAt: round?.startedAt ?? null,
        rounds: playing.rounds.map((entry) => ({
          map: entry.name,
          type: entry.isFinal ? ("final" as const) : entry.type,
          ...(entry.qualified.length > 0 ? { qualified: entry.qualified.length } : {}),
        })),
      };
      return json(live);
    }

    if (request.method === "POST" && pathname === "/api/publish") {
      const { message } = (await request.json()) as { message?: string };
      try {
        return json(await publish(message ?? ""));
      } catch (error) {
        return json({ committed: false, pushed: false, message: String(error) }, 400);
      }
    }

    // The admin is rebuilt on every request, so a cached copy is always the stale one.
    const fresh = (type: string) => ({ "content-type": type, "cache-control": "no-store" });

    // The public site polls these out of dist/, which only refreshes on a build. Serving them
    // from data/ means what the admin just saved is on the board within one poll.
    for (const [route, path] of [
      ["/event.json", EVENT_PATH],
      ["/players.json", PLAYERS_PATH],
    ] as const) {
      if (pathname === route) {
        return new Response(Bun.file(path), { headers: fresh("application/json") });
      }
    }

    if (pathname === "/admin" || pathname === "/admin.html") {
      return new Response(Bun.file("site/admin.html"), { headers: fresh("text/html") });
    }
    if (pathname === "/admin.css") {
      return new Response(Bun.file("site/admin.css"), { headers: fresh("text/css") });
    }
    if (pathname === "/admin.js") {
      const built = await Bun.build({ entrypoints: ["site/admin.ts"], target: "browser" });
      if (!built.success) return new Response(built.logs.join("\n"), { status: 500 });
      return new Response(built.outputs[0]!, { headers: fresh("text/javascript") });
    }

    const file = Bun.file(`dist${pathname === "/" ? "/index.html" : pathname}`);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});

console.log(`Public site   ${server.url}`);
console.log(`Admin         ${server.url}admin`);
console.log(`Publishing    ${AUTO_PUBLISH ? "on — every save is committed and pushed" : "off"}`);
console.log(
  `Recording     ${
    RECORD
      ? capture.ffmpeg
        ? `on — ${folders.segments}`
        : "off — no ffmpeg found, set FFMPEG_PATH"
      : "off"
  }`,
);
