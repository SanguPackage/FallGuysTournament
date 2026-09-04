import { logDate, parseLog } from "../src/log";
import { absoluteTimes, placeShots } from "../src/screenshots";
import { listShots, listShowShots, resolveShot } from "../src/shot-folder";
import { findLog, findScreenshotDir } from "../src/windows-path";
import { checkData } from "../src/data-check";
import { publish } from "../src/publish";
import { EVENT_PATH, PLAYERS_PATH, loadEvent, saveEvent } from "../src/storage";
import { setLobbyCode } from "../src/event";
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
import { recordArgv, thumbArgv } from "../src/capture/command";
import { captureFolders, captureSettings, runFolder, runsIn } from "../src/capture/paths";
import { clipFile, showsOnDisk, slugOf, type ShowFolder } from "../src/capture/layout";
import { toWindows } from "../src/capture/win-path";
import { Recorder } from "../src/capture/recorder";
import { onShutdown } from "../src/capture/shutdown";
import { orphanPids, processList } from "../src/capture/orphans";
import { Ledger, type LedgerState } from "../src/capture/ledger";
import { Serial } from "../src/capture/serial";
import { captureMoment, cutShowClip } from "../src/capture/pipeline";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { showNameNow, type LiveNow } from "../src/live";
import type { ParsedShow } from "../src/log";
import type { Players, TournamentEvent } from "../src/types";
import type { Shot, ShotSource } from "../src/screenshots";
import { Reporter } from "../src/transcript/report";
import { clock, column, duration, formatLine } from "../src/transcript/format";
import { linesBetween } from "../src/transcript/slice";
import {
  Transcript,
  openTranscriptFile,
  transcriptPath,
  type Entry,
  type Level,
  type TranscriptFile,
} from "../src/transcript/transcript";
import type { QueueEvent } from "../src/ocr/queue";

const SHOWS_PATH = "data/shows.json";
const CACHE_PATH = ".ocr-cache/reads.json";
const LEDGER_PATH = ".ocr-cache/captured.json";

/** What the terminal shows. The transcript file always gets everything. */
const LEVEL: Level = Bun.argv.includes("--trace")
  ? "trace"
  : Bun.argv.includes("--quiet")
    ? "quiet"
    : "normal";

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
  if (source === "auto") return RECORD ? folders.shows : undefined;
  return findScreenshotDir();
}

/**
 * Screenshots are a reading aid: a missing or unreadable folder must not stop the admin loading,
 * and one unreadable root must not cost the other.
 */
async function placed(dir: string | undefined, shows: ParsedShow[], date: string) {
  const shots: Shot[] = [];
  if (dir) {
    try {
      shots.push(...(await listShots(dir, date.slice(0, 7))));
    } catch {}
  }
  if (RECORD) {
    try {
      shots.push(...(await listShowShots(folders.shows, date)));
    } catch {}
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

/**
 * `keep` lays the save over what is on disk rather than replacing it. The admin sends back the
 * event it read when its tab was opened, so a field written since — the start hours, the prizes —
 * would otherwise be dropped by a tab that never knew about it.
 */
async function writeJson(
  path: string,
  request: Request,
  describe: (body: never) => string,
  keep = false,
): Promise<Response> {
  const sent = (await request.json()) as Record<string, unknown>;
  const body = keep ? { ...((await Bun.file(path).json()) as object), ...sent } : sent;
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

/**
 * The transcript's file is named for the event day, which the log only tells us once it has been
 * parsed. Lines written before then wait here rather than being dropped — the startup banner and
 * the first queue burst are the two most worth keeping.
 */
let transcriptFile: TranscriptFile | undefined;
const waitingForFile: string[] = [];

async function openTranscript(date: string): Promise<void> {
  if (transcriptFile) return;
  transcriptFile = await openTranscriptFile(transcriptPath(capture.dir, date));
  transcript.write({ kind: "note", text: `server started · ${date}` });
  for (const line of waitingForFile.splice(0)) transcriptFile(line);
}

/** The per-show transcripts are cut from these on every sweep. */
const eveningLines: Entry[] = [];

const transcript = new Transcript({
  level: LEVEL,
  colour: process.stdout.isTTY === true,
  out: (text) => console.log(text),
  file: (text) => (transcriptFile ? transcriptFile(text) : waitingForFile.push(text)),
  tap: (line) => eveningLines.push(line),
});

const reporter = new Reporter();

/** Seconds a read takes, measured rather than guessed, so the queue's ETA is worth reading. */
let perRead = 7;

function reportQueue(event: QueueEvent): void {
  const at = Date.now();
  if (event.kind === "queued") {
    const done = clock(at + event.waiting * perRead * 1000);
    transcript.write({
      kind: "entry",
      at,
      lane: "queue",
      level: "normal",
      text: `${event.waiting} waiting · ~${perRead}s each · done by ~${done}`,
    });
    return;
  }
  if (event.kind === "reading") {
    transcript.write({
      kind: "entry",
      at,
      lane: "queue",
      text: `${column(`${event.at}/${event.of}`, 8)}${event.path.split("/").pop()}`,
    });
    return;
  }
  // Every poll that offers nothing new still drains, so a read of 0 is noise rather than news.
  if (event.read === 0) return;
  perRead = Math.max(1, Math.round(event.took / event.read / 1000));
  transcript.write({
    kind: "entry",
    at,
    lane: "queue",
    level: "normal",
    text: `drained · ${event.read} read in ${duration(event.took)}`,
  });
}

const reader = new ReadQueue(readShot, reportQueue);
Object.assign(reader.cache(), await loadCache(CACHE_PATH));
setInterval(() => void saveCache(CACHE_PATH, reader.cache()), 10_000);

/** Reading is a convenience: a capture that cannot be read must not stop the admin loading. */
function queueReads(dir: string | undefined, shots: Shot[]): void {
  const roots: Record<ShotSource, string | undefined> = {
    sharex: dir,
    auto: RECORD ? folders.shows : undefined,
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
  const names = await readdir(folders.segments).catch(() => []);
  const segments: Segment[] = [];
  for (const run of runsIn(folders.segments, names, recorder.runs())) {
    const csv = await Bun.file(`${run.dir}/segments.csv`)
      .text()
      .catch(() => "");
    segments.push(...parseSegments(csv, run.startedAt, run.dir));
  }
  return segments;
}

/**
 * One frame of what is actually being recorded, so a monitor that is not the game shows up at a
 * glance rather than at the end of the night. The segment being written now is not listed yet, so
 * this lags by up to two segment lengths — enough to tell a desktop from a level.
 */
const THUMB_PATH = `${folders.scratch}/recording.jpg`;
let thumbOf: string | undefined;

async function recordingFrame(): Promise<string | undefined> {
  if (!RECORD || !capture.ffmpeg) return undefined;
  const newest = (await segmentsNow()).sort((a, b) => a.to - b.to).at(-1);
  if (!newest) return undefined;

  const segment = `${newest.dir}/${newest.file}`;
  const out = THUMB_PATH;
  if (thumbOf === segment && (await Bun.file(out).exists())) return out;

  const argv = thumbArgv({
    ffmpeg: capture.ffmpeg,
    segment: toWindows(segment),
    width: 480,
    out: toWindows(out),
  });
  if (!(await runFfmpeg(argv)).ok) return undefined;
  thumbOf = segment;
  return out;
}

/**
 * What each show's transcript was last written with. Comparing the whole text rather than a count:
 * a show's window closes when the next one starts, so a sweep can drop lines off the end while a
 * late arrival adds one inside, and a count that lands back where it was would skip the rewrite.
 */
const transcriptWritten = new Map<string, string>();

/**
 * Rewritten rather than appended: a line can land long after the show it belongs to — an OCR read,
 * a fill, an admin edit — and rewriting is what gets it into the right folder.
 */
async function writeShowTranscripts(onDisk: ShowFolder[]): Promise<void> {
  for (const show of onDisk) {
    const lines = linesBetween(eveningLines, show.from, show.to);
    if (lines.length === 0) continue;
    const text = `${lines.map((line) => formatLine(line)).join("\n")}\n`;
    if (transcriptWritten.get(show.dir) === text) continue;
    const folder = `${folders.shows}/${show.dir}`;
    await mkdir(folder, { recursive: true });
    await Bun.write(`${folder}/transcript.txt`, text);
    transcriptWritten.set(show.dir, text);
  }
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

  // Above the footage check: a transcript needs none, and a night where the recording never
  // started is the night it is worth the most.
  const onDisk = showsOnDisk(shows, day);
  const dirOf = new Map(onDisk.map((show) => [show.showIndex, show.dir]));
  await writeShowTranscripts(onDisk);

  const segments = await segmentsNow();
  if (segments.length === 0) return;

  for (const moment of momentsIn(shows, day)) {
    const showDir = dirOf.get(moment.showIndex);
    // A show whose first round has not loaded owns no folder yet, and its moments can wait.
    if (showDir === undefined || !ledger.pending(momentKey(moment))) continue;
    captureJobs.add(momentKey(moment), async () => {
      await captureMoment(moment, showDir, await segmentsNow(), ledger, {
        ffmpeg: capture.ffmpeg!,
        scratchDir: folders.scratch,
        showsDir: folders.shows,
        run: runFfmpeg,
        frameOf: frameFrom,
        screenOf: identify,
        now: () => Date.now(),
      });
    }, moment.at);
  }

  for (const clip of showClips(shows, day)) {
    const showDir = dirOf.get(clip.showIndex);
    if (showDir === undefined || !ledger.pending(clipKey(clip))) continue;
    const file = `${showDir}/${clipFile(day, clip.showIndex, slugOf(shows, clip.showIndex))}`;
    captureJobs.add(clipKey(clip), async () => {
      const cut = await cutShowClip(clip, file, await segmentsNow(), ledger, {
        ffmpeg: capture.ffmpeg!,
        scratchDir: folders.scratch,
        showsDir: folders.shows,
        run: runFfmpeg,
      });
      if (cut?.gapped) console.log(`${file}.mp4 — a recording died inside it, so the clip jumps`);
    }, clip.to);
  }
}

if (RECORD && capture.ffmpeg) {
  for (const dir of Object.values(folders)) await mkdir(dir, { recursive: true });
  for (const pid of orphanPids(processList(), toWindows(folders.segments), process.pid)) {
    try {
      process.kill(pid);
      console.log(`Recording  ${pid} was still running from a server that is gone — stopped`);
    } catch {}
  }
  recorder.start();
  onShutdown(
    () => {
      recorder.stop();
      writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger.state(), null, 2)}\n`);
    },
    () => process.exit(0),
  );
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
      const fills = fillsFor(shots, readsFor(shots), roster, times, event.shows);

      await openTranscript(day);
      const reads = readsFor(shots);
      for (const line of reporter.observe({ shows, date: day, shots, reads, fills })) {
        transcript.write(line);
      }

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
        captureDir: capture.dir,
        shots,
        fills,
        autoPublish: AUTO_PUBLISH,
        capture: RECORD ? recorder.status() : null,
        problems: await checkData(),
      });
    }

    if (pathname === "/api/recording-frame") {
      const frame = await recordingFrame();
      if (!frame) return new Response("Not found", { status: 404 });
      return new Response(Bun.file(frame), { headers: { "cache-control": "no-store" } });
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
      transcript.write({
        kind: "entry",
        at: Date.now(),
        lane: "admin",
        text: `re-read · show ${showIndex + 1} · ${shots.length} captures requeued`,
      });
      queueReads(shotDir, shots);
      return json({ rereading: shots.length });
    }

    /** The admin does its own filling in the browser; this is how the transcript hears about it. */
    if (request.method === "POST" && pathname === "/api/note") {
      const { text } = (await request.json()) as { text: string };
      transcript.write({ kind: "entry", at: Date.now(), lane: "admin", text: text.slice(0, 200) });
      return json({ noted: true });
    }

    if (request.method === "PUT" && pathname === "/api/players") {
      return writeJson(PLAYERS_PATH, request, () => "data: update players");
    }
    if (request.method === "PUT" && pathname === "/api/event") {
      return writeJson(EVENT_PATH, request, (saved: TournamentEvent) => defaultMessage(saved), true);
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
      const { message, lobbyCode } = (await request.json()) as {
        message?: string;
        lobbyCode?: string;
      };
      try {
        // Written before the commit, so the code the board shows is the one this push carries.
        if (lobbyCode !== undefined) {
          const event = await loadEvent();
          setLobbyCode(event, lobbyCode);
          await saveEvent(event);
        }
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

    // A cached bundle repaints `#data` a second after load, so a stale main.js quietly undoes the
    // build you just ran. Pages Cache-Controls the published site; this server is for seeing edits.
    const file = Bun.file(`dist${pathname === "/" ? "/index.html" : pathname}`);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "cache-control": "no-store" } });
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
