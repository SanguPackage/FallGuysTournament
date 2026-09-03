/**
 * Grows `data/ingame-names.txt` — the answer key the reading is scored against. Every name typed
 * into the admin lands in `event.json`, so running this after an evening keeps the ones that
 * evening taught us even once the event file moves on.
 */
import { mergeNames, namesIn } from "../src/names";
import type { Players, TournamentEvent } from "../src/types";

const OUT = "data/ingame-names.txt";

const event = (await Bun.file("data/event.json").json()) as TournamentEvent;
const players = (await Bun.file("data/players.json").json()) as Players;
const boards = (await Bun.file("fixtures/manifest.json").json()) as {
  files: Record<string, { names?: string[] }>;
};

const existing = (await Bun.file(OUT).text().catch(() => "")).split("\n");
// Names read off a screen by eye come in on stdin, which is where a show nobody typed into the
// admin gets its answer key from.
const typed = process.stdin.isTTY ? "" : await Bun.stdin.text();
const found = [
  ...typed.split("\n"),
  ...namesIn(event),
  ...players.players.flatMap((player) => (player.ingame ? [player.ingame] : [])),
  ...Object.values(boards.files).flatMap((entry) => entry.names ?? []),
];

const names = mergeNames(existing, found);
await Bun.write(OUT, `${names.join("\n")}\n`);
console.log(`${OUT} — ${names.length} names (${names.length - existing.filter(Boolean).length} new)`);
