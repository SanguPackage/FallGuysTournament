import { readdir } from "node:fs/promises";
import { CAPTURE_DIR_DEFAULT, captureFolders } from "../src/capture/paths";
import { mergeNames } from "../src/names";
import { assign, cleanToken } from "../src/ocr/match";
import { readShot } from "../src/ocr/read";
import { findScreenshotDir } from "../src/windows-path";

/**
 * Scores the reader against the boards `fixtures/manifest.json` names by eye, and the matcher
 * against two rosters.
 *
 * `board` is the board's own names: the roster the matcher would face if exactly those players were
 * registered, and the number this script has always reported. `everyone` is
 * `data/ingame-names.txt`, every name the tournament has seen, which is the size of pool the event
 * really hands it — the same read now has strangers to be confused by.
 */

interface Manifest {
  files: Record<string, { names?: string[] }>;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        corner + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      corner = above;
    }
  }
  return row[b.length]!;
}

const LATIN = /^[\x20-\x7E]+$/;

const manifest = (await Bun.file("fixtures/manifest.json").json()) as Manifest;
const month = ((await Bun.file("data/event.json").json()) as { date: string }).date.slice(0, 7);

// Every board named by eye, each committed alongside the picture it names, so the score is the same
// number on any machine.
const boards = Object.entries(manifest.files).flatMap(([file, entry]): [string, string[]][] =>
  entry.names ? [[`fixtures/${file}`, entry.names]] : [],
);

// A board cut out of the recording and one shot by hand are the same picture, so every root is
// searched by the file's own name. ShareX files by month; ours are filed per show.
const months = [await findScreenshotDir()].filter((dir): dir is string => dir !== undefined);
const showsDir = captureFolders(process.env.CAPTURE_DIR ?? CAPTURE_DIR_DEFAULT).shows;

async function locate(file: string): Promise<string | undefined> {
  if (await Bun.file(file).exists()) return file;
  for (const root of months) {
    const path = `${root}/${month}/${file}`;
    if (await Bun.file(path).exists()) return path;
  }
  for (const show of await readdir(showsDir).catch(() => [])) {
    const path = `${showsDir}/${show}/${file}`;
    if (await Bun.file(path).exists()) return path;
  }
  return undefined;
}
const everyone = mergeNames([], (await Bun.file("data/ingame-names.txt").text()).split("\n"));

// Naming a board by eye is the slow part, so `--dump <file>` prints what the reader saw, in board
// order, as a JSON array to correct and paste into fixtures/manifest.json.
const dump = process.argv.indexOf("--dump");
if (dump !== -1) {
  const file = process.argv[dump + 1];
  if (file === undefined) {
    console.error("--dump wants a capture filename");
    process.exit(1);
  }
  const path = await locate(file);
  if (path === undefined) {
    console.error(`${file} — not under ${[...months, showsDir].join(" or ")}`);
    process.exit(1);
  }
  const tokens = ((await readShot(path))?.tokens ?? []).map(cleanToken);
  console.log(`  ${JSON.stringify(file)}: ${JSON.stringify(tokens, null, 2).replace(/\n/g, "\n  ")}`);
  process.exit(0);
}

let readExact = 0;
let readChars = 0;
let readErrors = 0;
const matched = { board: 0, everyone: 0 };
let total = 0;
let skippedNonLatin = 0;
const rows: string[][] = [];

for (const [file, expected] of boards) {
  const path = await locate(file);
  if (path === undefined) {
    console.log(`skip ${file} — not on this machine`);
    continue;
  }

  const read = await readShot(path);
  const tokens = (read?.tokens ?? []).map(cleanToken);
  // A name the file has not been taught yet is unreachable against `everyone`, and scoring it as a
  // miss would measure the answer key rather than the matcher.
  const missing = expected.filter((name) => !everyone.includes(name));
  const decided = {
    board: assign(tokens, expected).map((m) => m.value),
    everyone: assign(tokens, everyone).map((m) => m.value),
  };

  console.log(`\n${file}  —  ${expected.length} names, ${tokens.length} read`);
  if (missing.length > 0) {
    console.log(`  ${missing.length} not in data/ingame-names.txt: ${missing.join(", ")}`);
  }
  for (const [i, want] of expected.entries()) {
    const got = tokens[i] ?? "";
    const settled = { board: decided.board[i] ?? "", everyone: decided.everyone[i] ?? "" };
    const latin = LATIN.test(want);
    const exact = got === want;
    const hit = { board: settled.board === want, everyone: settled.everyone === want };

    total += 1;
    if (!latin) skippedNonLatin += 1;
    if (exact) readExact += 1;
    if (hit.board) matched.board += 1;
    if (hit.everyone) matched.everyone += 1;
    readChars += want.length;
    readErrors += distance(got, want);

    const mark = hit.everyone ? "OK  " : hit.board ? "pool" : exact ? "read" : "MISS";
    const landed = settled.everyone === got ? "" : `  ->  ${JSON.stringify(settled.everyone)}`;
    console.log(`  ${mark} want ${JSON.stringify(want)}  read ${JSON.stringify(got)}${hit.everyone ? "" : landed}`);
    rows.push([file, want, got, settled.board, settled.everyone]);
  }
}

const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
console.log(`\n${"=".repeat(60)}`);
console.log(`names            ${total}  (${skippedNonLatin} not written in the Latin alphabet)`);
console.log(`read exactly     ${readExact}  ${pct(readExact)}`);
console.log(`character errors ${readErrors} over ${readChars} chars  ${((readErrors / readChars) * 100).toFixed(0)}%`);
console.log(`matched — board  ${matched.board}  ${pct(matched.board)}   against the board's own ${"names".padEnd(5)}`);
console.log(`matched — all    ${matched.everyone}  ${pct(matched.everyone)}   against all ${everyone.length} names   <- the number that matters`);

if (process.argv[2] === "--csv") {
  await Bun.write(
    "ocr-score.csv",
    ["file,expected,read,board,everyone", ...rows.map((r) => r.map((c) => JSON.stringify(c)).join(","))].join("\n"),
  );
  console.log("\nwrote ocr-score.csv");
}
