import { resolve } from "node:path";
import { parseLog } from "../src/log";
import { placeShots } from "../src/screenshots";
import { listShots } from "../src/shot-folder";
import { findLog, findScreenshotDir } from "../src/windows-path";
import { publish } from "../src/publish";
import { EVENT_PATH, PLAYERS_PATH } from "../src/storage";
import { parseShowOrder } from "../site/rules";
import type { ParsedShow } from "../src/log";
import type { TournamentEvent } from "../src/types";

const SHOWS_PATH = "data/shows.json";

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
    return placeShots(await listShots(dir), shows, date);
  } catch {
    return [];
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function writeJson(path: string, request: Request): Promise<Response> {
  const body = await request.json();
  await Bun.write(path, `${JSON.stringify(body, null, 2)}\n`);
  return json({ saved: path });
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
      return json({
        players: await Bun.file(PLAYERS_PATH).json(),
        event,
        showNames: Object.keys(
          ((await Bun.file(SHOWS_PATH).json()) as { shows: Record<string, unknown> }).shows,
        ).sort(),
        order: parseShowOrder(await Bun.file("docs/rules.md").text()),
        logPath: logPath ?? null,
        shows,
        shotDir: shotDir ?? null,
        shots: await placed(shotDir, shows, event.date),
      });
    }

    if (pathname === "/api/shot") {
      const dir = await findScreenshotDir();
      const file = new URL(request.url).searchParams.get("f");
      if (!dir || !file) return new Response("Not found", { status: 404 });
      const path = resolve(dir, file);
      // A relative path from the browser must not be able to walk out of the ShareX folder.
      if (!path.startsWith(`${resolve(dir)}/`)) return new Response("Forbidden", { status: 403 });
      const image = Bun.file(path);
      if (!(await image.exists())) return new Response("Not found", { status: 404 });
      return new Response(image);
    }

    if (request.method === "PUT" && pathname === "/api/players") {
      return writeJson(PLAYERS_PATH, request);
    }
    if (request.method === "PUT" && pathname === "/api/event") {
      return writeJson(EVENT_PATH, request);
    }

    if (request.method === "POST" && pathname === "/api/publish") {
      const { message } = (await request.json()) as { message?: string };
      try {
        return json(await publish(message ?? ""));
      } catch (error) {
        return json({ committed: false, pushed: false, message: String(error) }, 400);
      }
    }

    if (pathname === "/admin" || pathname === "/admin.html") {
      return new Response(Bun.file("site/admin.html"), {
        headers: { "content-type": "text/html" },
      });
    }
    if (pathname === "/admin.css") {
      return new Response(Bun.file("site/admin.css"), { headers: { "content-type": "text/css" } });
    }
    if (pathname === "/admin.js") {
      const built = await Bun.build({ entrypoints: ["site/admin.ts"], target: "browser" });
      if (!built.success) return new Response(built.logs.join("\n"), { status: 500 });
      return new Response(built.outputs[0]!, { headers: { "content-type": "text/javascript" } });
    }

    const file = Bun.file(`dist${pathname === "/" ? "/index.html" : pathname}`);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});

console.log(`Public site   ${server.url}`);
console.log(`Admin         ${server.url}admin`);
