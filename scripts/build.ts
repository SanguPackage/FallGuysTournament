import { rm } from "node:fs/promises";

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
  ["site/index.html", `${OUT}/index.html`],
  ["site/styles.css", `${OUT}/styles.css`],
  ["data/event.json", `${OUT}/event.json`],
  ["data/players.json", `${OUT}/players.json`],
] as const) {
  await Bun.write(to, Bun.file(from));
}

console.log(`Built ${OUT}/`);
