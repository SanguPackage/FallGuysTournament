import { assign, cleanToken } from "../src/ocr/match";
import { readShot } from "../src/ocr/read";
import { findScreenshotDir } from "../src/windows-path";

/**
 * Scores the reader against boards read by eye, and the matcher against the same board's own names.
 *
 * A board's true names are exactly the roster the matcher would face if those players were the ones
 * registered, so match accuracy is measurable here without waiting for a capture of the tournament.
 */

interface Truth {
  boards: Record<string, string[]>;
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

const truth = (await Bun.file("data/ocr-truth.json").json()) as Truth;
const root = await findScreenshotDir();
if (!root) {
  console.error("No ShareX folder found. Set SHAREX_DIR.");
  process.exit(1);
}
const month = ((await Bun.file("data/event.json").json()) as { date: string }).date.slice(0, 7);

let readExact = 0;
let readChars = 0;
let readErrors = 0;
let matched = 0;
let total = 0;
let skippedNonLatin = 0;
const rows: string[][] = [];

for (const [file, expected] of Object.entries(truth.boards)) {
  const path = `${root}/${month}/${file}`;
  if (!(await Bun.file(path).exists())) {
    console.log(`skip ${file} — not on this machine`);
    continue;
  }

  const read = await readShot(path);
  const tokens = (read?.tokens ?? []).map(cleanToken);
  // The board's own names stand in for the roster, which is what the matcher would really be given.
  const decided = assign(tokens, expected).map((m) => m.value);

  console.log(`\n${file}  —  ${expected.length} names, ${tokens.length} read`);
  for (const [i, want] of expected.entries()) {
    const got = tokens[i] ?? "";
    const settled = decided[i] ?? "";
    const latin = LATIN.test(want);
    const exact = got === want;
    const hit = settled === want;

    total += 1;
    if (!latin) skippedNonLatin += 1;
    if (exact) readExact += 1;
    if (hit) matched += 1;
    readChars += want.length;
    readErrors += distance(got, want);

    const mark = hit ? "OK  " : exact ? "read" : "MISS";
    console.log(`  ${mark} want ${JSON.stringify(want)}  read ${JSON.stringify(got)}${hit || settled === got ? "" : `  ->  ${JSON.stringify(settled)}`}`);
    rows.push([file, want, got, settled]);
  }
}

const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
console.log(`\n${"=".repeat(60)}`);
console.log(`names            ${total}  (${skippedNonLatin} not written in the Latin alphabet)`);
console.log(`read exactly     ${readExact}  ${pct(readExact)}`);
console.log(`character errors ${readErrors} over ${readChars} chars  ${((readErrors / readChars) * 100).toFixed(0)}%`);
console.log(`matched to name  ${matched}  ${pct(matched)}   <- the number that matters`);

if (process.argv[2] === "--csv") {
  await Bun.write(
    "ocr-score.csv",
    ["file,expected,read,matched", ...rows.map((r) => r.map((c) => JSON.stringify(c)).join(","))].join("\n"),
  );
  console.log("\nwrote ocr-score.csv");
}
