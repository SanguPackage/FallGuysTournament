import { parseLog } from "../src/log";
import { EVENT_PATH, PLAYERS_PATH } from "../src/storage";

const SHOWS_PATH = "data/shows.json";

const LOG_NAME = "AppData/LocalLow/Mediatonic/FallGuys_client/Player.log";

async function findLog(): Promise<string | undefined> {
  const candidates = [process.env.FALLGUYS_LOG];
  if (process.env.USERPROFILE) candidates.push(`${process.env.USERPROFILE}/${LOG_NAME}`);
  for await (const path of new Bun.Glob(`*/${LOG_NAME}`).scan("/mnt/c/Users")) {
    candidates.push(`/mnt/c/Users/${path}`);
  }
  for (const path of candidates) {
    if (path && (await Bun.file(path).exists())) return path;
  }
  return undefined;
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
  port: 3000,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/state") {
      const logPath = await findLog();
      return json({
        players: await Bun.file(PLAYERS_PATH).json(),
        event: await Bun.file(EVENT_PATH).json(),
        showNames: Object.keys(
          ((await Bun.file(SHOWS_PATH).json()) as { shows: Record<string, unknown> }).shows,
        ).sort(),
        logPath: logPath ?? null,
        shows: logPath ? parseLog(await Bun.file(logPath).text()) : [],
      });
    }

    if (request.method === "PUT" && pathname === "/api/players") {
      return writeJson(PLAYERS_PATH, request);
    }
    if (request.method === "PUT" && pathname === "/api/event") {
      return writeJson(EVENT_PATH, request);
    }

    if (pathname === "/admin" || pathname === "/admin.html") {
      return new Response(Bun.file("site/admin.html"), {
        headers: { "content-type": "text/html" },
      });
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
