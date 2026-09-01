/**
 * Re-reads every recorded round's level id through data/rounds.json. Shows entered before a
 * round table existed carry the id as their name and `race` as their type, which scores a
 * first place on rounds that never had one.
 */
import { SCORES_FIRST } from "../site/admin-model";
import { identify } from "../src/rounds";
import { EVENT_PATH } from "../src/storage";
import type { TournamentEvent } from "../src/types";

const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
const changes: string[] = [];

for (const show of event.shows) {
  show.rounds.forEach((round, index) => {
    const found = identify(round.map);
    // An id no table names, or a round already carrying its name: the admin's own entry wins.
    if (found.name === round.map) return;

    const type = index === show.rounds.length - 1 ? "final" : found.type;
    const dropped = round.first && !SCORES_FIRST.has(type) ? ` — dropping first ${round.first}` : "";
    changes.push(`${show.name}: ${round.map} -> ${found.name} (${round.type} -> ${type})${dropped}`);

    round.map = found.name;
    round.type = type;
    if (dropped) delete round.first;
  });
}

if (changes.length === 0) {
  console.log("Every recorded round already carries its name and type.");
} else {
  for (const change of changes) console.log(change);
  if (Bun.argv.includes("--write")) {
    await Bun.write(EVENT_PATH, `${JSON.stringify(event, null, 2)}\n`);
    console.log(`\nWrote ${EVENT_PATH}. Publish from the admin to put it on the board.`);
  } else {
    console.log(`\n${changes.length} changes. Re-run with --write to apply.`);
  }
}
