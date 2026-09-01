import { rm } from "node:fs/promises";
import { nav, page } from "../site/page";
import { parseShowOrder, renderMarkdown, renderShowOrder } from "../site/rules";

const OUT = "dist";

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
] as const) {
  await Bun.write(to, Bun.file(from));
}

const rules = await Bun.file("docs/rules.md").text();

await Bun.write(
  `${OUT}/index.html`,
  (await Bun.file("site/index.html").text()).replace("<!--nav-->", nav("index.html")),
);
await Bun.write(
  `${OUT}/rules.html`,
  page({ title: "Rules — FOM Fall Guys Tournament", current: "rules.html", body: renderMarkdown(rules) }),
);
await Bun.write(
  `${OUT}/shows.html`,
  page({
    title: "Show order — FOM Fall Guys Tournament",
    current: "shows.html",
    body: `<h1>Show order</h1>
<p class="subtitle">Played top to bottom, working up from the gentlest to the hardest.</p>
${renderShowOrder(parseShowOrder(rules))}`,
  }),
);

console.log(`Built ${OUT}/`);
