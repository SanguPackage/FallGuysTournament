import { parseLog } from "../src/log";
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
import type { LiveNow } from "../src/live";
import type { ParsedShow } from "../src/log";
import type { Players, TournamentEvent } from "../src/types";
import type { Shot } from "../src/screenshots";

const SHOWS_PATH = "data/shows.json";
const CACHE_PATH = ".ocr-cache/reads.json";

/**
 * Off by default: development saves the same files the event does, and every save would otherwise
 * land on the public board. `bun run live` turns it on for the night itself.
 */
const AUTO_PUBLISH = Bun.argv.includes("--publish");

/** The log is a convenience: it prefills rounds. Losing it must not stop the admin loading. */
async function parsedShows(logPath: string | undefined) {
  if (!logPath) return [];
  try {
    return parseLog(await Bun.file(logPath).text());
  } catch {
    return [];
  }
}

/** Screenshots are a reading aid: a missing or unreadable folder must not stop the admin loading. */
async function placed(dir: string | undefined, shows: ParsedShow[], date: string) {
  if (!dir) return [];
  try {
    return placeShots(await listShots(dir, date.slice(0, 7)), shows, date);
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
  if (!AUTO_PUBLISH) return json({ saved: path });

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
  if (!dir) return;
  reader.offer(
    shots.flatMap((shot) => {
      const path = resolveShot(dir, shot.file);
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

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/state") {
      const logPath = await findLog();
      const shotDir = await findScreenshotDir();
      const shows = await parsedShows(logPath);
      const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
      const shots = await placed(shotDir, shows, event.date);
      queueReads(shotDir, shots);
      const players = (await Bun.file(PLAYERS_PATH).json()) as Players;
      const roster = players.players.flatMap((player) => (player.ingame ? [player.ingame] : []));

      return json({
        players,
        event,
        showNames: Object.keys(
          ((await Bun.file(SHOWS_PATH).json()) as { shows: Record<string, unknown> }).shows,
        ).sort(),
        order: parseShowOrder(await Bun.file("docs/rules.md").text()),
        logPath: logPath ?? null,
        shows,
        times: absoluteTimes(shows, event.date),
        shotDir: shotDir ?? null,
        shots,
        fills: fillsFor(shots, readsFor(shots), roster),
        autoPublish: AUTO_PUBLISH,
        problems: await checkData(),
      });
    }

    if (pathname === "/api/shot") {
      const dir = await findScreenshotDir();
      const file = new URL(request.url).searchParams.get("f");
      if (!dir || !file) return new Response("Not found", { status: 404 });
      const path = resolveShot(dir, file);
      if (!path) return new Response("Forbidden", { status: 403 });
      const image = Bun.file(path);
      if (!(await image.exists())) return new Response("Not found", { status: 404 });
      return new Response(image);
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
      const playing = (await parsedShows(await findLog())).at(-1);
      if (!playing) return json(null);

      const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
      const recorded = event.shows.map((show) => show.name);
      const order = parseShowOrder(await Bun.file("docs/rules.md").text());
      const round = playing.rounds.at(-1);

      // A recorded show without winners is the one still being typed in; anything else means the
      // lobby has moved on to the next show in the plan.
      const last = event.shows.at(-1);
      const typing = last !== undefined && !last.winners?.length;

      const live: LiveNow = {
        show: typing ? last.name : suggestShowName(order, recorded),
        showNumber: typing ? event.shows.length : event.shows.length + 1,
        round: playing.rounds.length,
        map: round?.name ?? null,
        type: round ? (round.isFinal ? "final" : round.type) : null,
        startedAt: round?.startedAt ?? null,
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
