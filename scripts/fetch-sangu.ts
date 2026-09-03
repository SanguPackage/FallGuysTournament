/**
 * Fall Guys reference data published at https://sangu.be/fallguys/: the crowns each crown level
 * costs, and which levels have a clip page there to link a round's map to.
 */
const REPO = "https://github.com/SanguPackage/fallguys";
const CROWNS_URL = "https://raw.githubusercontent.com/SanguPackage/fallguys/main/_data/crownlevels.yml";
const LEVELS_URL = "https://api.github.com/repos/SanguPackage/fallguys/contents/_levels?per_page=200";
const OUT = "data/sangu.json";

const LEAST_LEVELS = 80;
const LEAST_PAGES = 60;

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { accept: "application/vnd.github+json" } });
  if (!response.ok) {
    console.error(`${url} returned ${response.status}`);
    process.exit(1);
  }
  return response;
}

/** Cumulative crowns to reach each level, level 1 first. The wiki table starts at 2: level 1 is free. */
async function crownLevels(): Promise<number[]> {
  const crowns = [0];
  let level = 0;

  for (const line of (await (await get(CROWNS_URL)).text()).split("\n")) {
    const start = /^- level: (\d+)$/.exec(line);
    if (start) {
      level = Number(start[1]);
      continue;
    }
    const cost = /^ {2}crowns: (\d+)$/.exec(line);
    if (!cost) continue;

    if (level !== crowns.length + 1) {
      console.error(`Level ${level} follows level ${crowns.length}; crownlevels.yml skips or repeats one.`);
      process.exit(1);
    }
    if (Number(cost[1]) <= crowns[crowns.length - 1]!) {
      console.error(`Level ${level} costs no more than the level under it; crownlevels.yml is out of order.`);
      process.exit(1);
    }
    crowns.push(Number(cost[1]));
  }

  if (crowns.length < LEAST_LEVELS) {
    console.error(`Only ${crowns.length} crown levels parsed; crownlevels.yml changed format.`);
    process.exit(1);
  }
  return crowns;
}

async function levelPages(): Promise<string[]> {
  const entries = (await (await get(LEVELS_URL)).json()) as { name: string }[];
  const pages = entries
    .filter((entry) => entry.name.endsWith(".html"))
    .map((entry) => entry.name.slice(0, -".html".length))
    .sort();

  if (pages.length < LEAST_PAGES) {
    console.error(`Only ${pages.length} level pages found; the _levels collection moved.`);
    process.exit(1);
  }
  return pages;
}

const body = {
  source: REPO,
  fetched: new Date().toISOString().slice(0, 10),
  crownLevels: await crownLevels(),
  levelPages: await levelPages(),
};
await Bun.write(OUT, `${JSON.stringify(body, null, 2)}\n`);
console.log(`Wrote ${body.crownLevels.length} crown levels and ${body.levelPages.length} level pages to ${OUT}`);

export {};
