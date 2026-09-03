/**
 * Fall Guys reference data published at https://sangu.be/fallguys/: the crowns each crown level
 * costs, which levels have a clip page there to link a round's map to, and the game's own icon
 * for each of them. Icons are copied into the repo rather than hotlinked, so the board still
 * draws on a LAN with no way out.
 */
const REPO = "https://github.com/SanguPackage/fallguys";
const CROWNS_URL = "https://raw.githubusercontent.com/SanguPackage/fallguys/main/_data/crownlevels.yml";
const LEVELS_URL = "https://api.github.com/repos/SanguPackage/fallguys/contents/_levels?per_page=200";
const ICONS_URL = "https://api.github.com/repos/SanguPackage/fallguys/contents/img/levels?per_page=300";
const OUT = "data/sangu.json";
const ICON_DIR = "site/img/levels";

const LEAST_LEVELS = 80;
const LEAST_PAGES = 60;
const LEAST_ICONS = 70;

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

/** One icon per level, named for it, so `levelIcon` can go straight from a map name to a file. */
async function levelIcons(): Promise<string[]> {
  const entries = (await (await get(ICONS_URL)).json()) as { name: string; download_url: string }[];
  const icons = entries.filter((entry) => entry.name.endsWith("-icon.png")).sort((a, b) => a.name.localeCompare(b.name));

  if (icons.length < LEAST_ICONS) {
    console.error(`Only ${icons.length} level icons found; img/levels moved or was renamed.`);
    process.exit(1);
  }

  let drawn = 0;
  for (const icon of icons) {
    const path = `${ICON_DIR}/${icon.name}`;
    if (await Bun.file(path).exists()) continue;
    await Bun.write(path, await (await get(icon.download_url)).arrayBuffer());
    drawn += 1;
  }
  if (drawn > 0) console.log(`Downloaded ${drawn} level icons to ${ICON_DIR}`);

  return icons.map((icon) => icon.name.slice(0, -"-icon.png".length));
}

const body = {
  source: REPO,
  fetched: new Date().toISOString().slice(0, 10),
  crownLevels: await crownLevels(),
  levelPages: await levelPages(),
  levelIcons: await levelIcons(),
};
await Bun.write(OUT, `${JSON.stringify(body, null, 2)}\n`);
console.log(
  `Wrote ${body.crownLevels.length} crown levels, ${body.levelPages.length} level pages and ${body.levelIcons.length} icons to ${OUT}`,
);

export {};
