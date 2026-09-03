import { cp, rm } from "node:fs/promises";
import { liveStatus } from "../src/live";
import { score } from "../src/scoring";
import type { Players, TournamentEvent } from "../src/types";
import type { LivePage } from "../site/page";
import { page } from "../site/page";
import { renderField, renderPodium, renderStandings, renderStatus } from "../site/render";
import { renderResults } from "../site/results";
import { renderShowNow } from "../site/show-field";
import { parseShowOrder, renderMarkdown, renderShowOrder } from "../site/rules";

const OUT = "dist";
const TITLE = "FOM Fall Guys Tournament";

await rm(OUT, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["site/main.ts"],
  outdir: OUT,
  minify: true,
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const [from, to] of [
  ["site/styles.css", `${OUT}/styles.css`],
  ["data/event.json", `${OUT}/event.json`],
  ["data/players.json", `${OUT}/players.json`],
  ["data/shows.json", `${OUT}/shows.json`],
] as const) {
  await Bun.write(to, Bun.file(from));
}

await cp("site/img", `${OUT}/img`, { recursive: true });

const rules = await Bun.file("docs/rules.md").text();
const order = parseShowOrder(rules);
const event = (await Bun.file("data/event.json").json()) as TournamentEvent;
const players = (await Bun.file("data/players.json").json()) as Players;
const rows = score(event, players);
const status = liveStatus(event, order);

await Bun.write(`${OUT}/order.json`, JSON.stringify(order));

/** Pre-rendered so the board reads correctly before the first poll, and without JavaScript at all. */
const data = (body: string): string => `      <div id="data">${body}</div>`;

const PAGES: { file: string; heading: string; title: string; live?: LivePage; body: string }[] = [
  {
    file: "index.html",
    heading: TITLE,
    title: TITLE,
    live: "dashboard",
    body: data(
      renderStatus(status, order) +
        renderShowNow(event, players.players, status) +
        renderPodium(rows) +
        renderField(rows),
    ),
  },
  {
    file: "standings.html",
    heading: "Standings",
    title: `Standings — ${TITLE}`,
    live: "standings",
    body: data(renderStandings(rows)),
  },
  {
    file: "results.html",
    heading: "Results",
    title: `Results — ${TITLE}`,
    live: "results",
    body: data(renderResults(event.shows, players.players)),
  },
  {
    file: "rules.html",
    heading: "Rules",
    title: `Rules — ${TITLE}`,
    body: `      <div class="doc">${renderMarkdown(rules)}</div>`,
  },
  {
    file: "shows.html",
    heading: "Show order",
    title: `Show order — ${TITLE}`,
    live: "shows",
    body: `      <p class="lead">A show the number of players present cannot support is skipped.</p>
${data(renderShowOrder(order, status.orderIndex))}`,
  },
];

for (const { file, heading, title, live, body } of PAGES) {
  await Bun.write(`${OUT}/${file}`, page({ event: event.name, title, heading, current: file, body, live }));
}

console.log(`Built ${OUT}/`);
