/**
 * Round ids in the log are internal level names with a variant suffix, and the game ships no
 * table of them. Two community trackers keep one, and neither is complete on its own:
 * FinalBeansStats keys the classic rounds on the id without its suffix, so one entry covers
 * every variant; Fallalytics is the only one carrying the Creative (`wle_s10_*`) rounds.
 */
const SOURCES = [
  {
    url: "https://raw.githubusercontent.com/Micdu70/FinalBeansStats/main/Entities/LevelStats.cs",
    page: "https://github.com/Micdu70/FinalBeansStats/blob/main/Entities/LevelStats.cs",
    entry: /new LevelStats\("([^"]+)",\s*"([^"]+)",\s*LevelType\.(\w+)/g,
    least: 80,
  },
  {
    url: "https://raw.githubusercontent.com/Hoier/Fallalytics/main/util/rounds.js",
    page: "https://github.com/Hoier/Fallalytics/blob/main/util/rounds.js",
    entry: /"([^"]+)":\s*\{\s*name:\s*"([^"]+)",\s*type:\s*"(\w+)"/g,
    least: 130,
  },
] as const;

const OUT = "data/rounds.json";

/** Sweet Thieves and Treat Thieves are thieves-versus-guardians, which is a team round. */
const TYPES: Record<string, string> = {
  Race: "race",
  Survival: "survival",
  Hunt: "hunt",
  Logic: "logic",
  Team: "team",
  Invisibeans: "team",
  Creative: "unknown",
  Final: "final",
};

const rounds: Record<string, { name: string; type: string }> = {};

for (const { url, entry, least } of SOURCES) {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`${url} returned ${response.status}`);
    process.exit(1);
  }

  let found = 0;
  for (const [, id, name, type] of (await response.text()).matchAll(entry)) {
    const mapped = TYPES[type!];
    if (!mapped) {
      console.error(`Unknown round type ${type} on ${id} in ${url}`);
      process.exit(1);
    }
    found += 1;
    // The first source wins: its ids are the shorter ones, and a longest-prefix lookup would
    // otherwise never reach them.
    rounds[id!] ??= { name: name!, type: mapped };
  }

  if (found < least) {
    console.error(`Only ${found} rounds parsed from ${url}; its format changed.`);
    process.exit(1);
  }
}

const sorted = Object.fromEntries(Object.entries(rounds).sort(([a], [b]) => a.localeCompare(b)));
const body = {
  sources: SOURCES.map(({ page }) => page),
  fetched: new Date().toISOString().slice(0, 10),
  rounds: sorted,
};
await Bun.write(OUT, `${JSON.stringify(body, null, 2)}\n`);
console.log(`Wrote ${Object.keys(sorted).length} rounds to ${OUT}`);

export {};
