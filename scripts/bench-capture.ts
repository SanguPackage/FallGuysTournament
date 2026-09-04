/**
 * Times `captureMoment` against a saved recording, so a change to the extract/pick loop can be
 * measured rather than argued about.
 *
 * The fixture is a copy of a real `CAPTURE_DIR` run — `segments/<run>/seg-*.mkv` plus its
 * `segments.csv`, and the `Player.log` that names the moments inside it. `CAPTURE_DIR` is emptied
 * between runs, so the fixture lives outside it; point `BENCH_DIR` at yours.
 *
 *     bun run scripts/bench-capture.ts [case ...]
 */
import { mkdir, rm } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { captureMoment } from "../src/capture/pipeline";
import { Ledger } from "../src/capture/ledger";
import { momentsIn, type Moment } from "../src/capture/moments";
import { parseSegments, type Segment } from "../src/capture/segments";
import { captureSettings, runStartedAt } from "../src/capture/paths";
import { frameFrom } from "../src/ocr/frame";
import { identify } from "../src/ocr/recognizers";
import { logDate, parseLog } from "../src/log";

const BENCH = process.env.BENCH_DIR ?? "/mnt/c/temp/fg-bench";
const OUT = `${BENCH}/out`;

const capture = await captureSettings(process.env);
if (!capture.ffmpeg) throw new Error("no ffmpeg — set FFMPEG_PATH");

const text = await Bun.file(`${BENCH}/Player.log`).text();
const shows = parseLog(text);
const date = logDate(text);
if (date === undefined) throw new Error(`${BENCH}/Player.log has no dated line`);

const segments: Segment[] = [];
for (const run of readdirSync(`${BENCH}/segments`)) {
  const startedAt = runStartedAt(run);
  if (startedAt === undefined) continue;
  const dir = `${BENCH}/segments/${run}`;
  // A recorder that died before its first segment closed wrote no list at all.
  const csv = Bun.file(`${dir}/segments.csv`);
  if (!(await csv.exists())) continue;
  segments.push(...parseSegments(await csv.text(), startedAt, dir));
}
if (segments.length === 0) throw new Error(`no segments under ${BENCH}/segments`);

const moments = momentsIn(shows, date);

/**
 * A window aimed at footage holding nothing it wants. The pass that finds no toast is the one that
 * costs the most — it decodes every frame it extracted — and a real log rarely has one to hand.
 */
function miss(kind: Moment["kind"], at: number): Moment {
  const like = moments.find((moment) => moment.kind === kind);
  if (!like) throw new Error(`the log has no ${kind} moment to shape a miss after`);
  return { ...like, at, from: at + (like.from - like.at), to: at + (like.to - like.at) };
}

interface Case {
  name: string;
  moment: Moment;
}

const cases: Case[] = [
  ...moments.map((moment) => ({
    name: `${moment.kind}-r${moment.roundNumber}-s${moment.showIndex}`,
    moment,
  })),
  { name: "first-miss", moment: miss("first", segments[1]!.from + 5000) },
];

interface Timing {
  frames: number;
  /** ffmpeg invocations. Wall time is not summable here: the stills are pulled concurrently. */
  spawns: number;
  decodeMs: number;
  classifyMs: number;
  totalMs: number;
  kept: number;
}

async function time(moment: Moment): Promise<Timing> {
  let spawns = 0;
  let decodeMs = 0;
  let classifyMs = 0;
  let frames = 0;

  const startedAt = performance.now();
  const kept = await captureMoment(moment, "bench", segments, new Ledger(), {
    ffmpeg: capture.ffmpeg!,
    scratchDir: `${OUT}/scratch`,
    showsDir: OUT,
    run: async (argv) => {
      spawns += 1;
      const child = Bun.spawn(argv, { stdout: "ignore", stderr: "pipe" });
      const stderr = await new Response(child.stderr).text();
      return { ok: (await child.exited) === 0, stderr };
    },
    frameOf: async (path) => {
      const at = performance.now();
      const frame = await frameFrom(path);
      decodeMs += performance.now() - at;
      frames += 1;
      return frame;
    },
    screenOf: (frame) => {
      const at = performance.now();
      const screen = identify(frame);
      classifyMs += performance.now() - at;
      return screen;
    },
    now: () => Date.now(),
  });

  return {
    frames,
    spawns,
    decodeMs,
    classifyMs,
    totalMs: performance.now() - startedAt,
    kept: kept.length,
  };
}

/** The recorder is running while this measures, so a single run is worth little. */
const RUNS = Number(process.env.BENCH_RUNS ?? 3);

const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const chosen = wanted.length === 0 ? cases : cases.filter((one) => wanted.includes(one.name));
if (chosen.length === 0) throw new Error(`no case named ${wanted.join(", ")}`);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
let total = 0;

console.log(`best of ${RUNS}\n`);
console.log("case                   decoded  kept  spawns   decode  classify    total");

for (const one of chosen) {
  const runs: Timing[] = [];
  for (let run = 0; run < RUNS; run++) runs.push(await time(one.moment));
  const timing = runs.reduce((best, run) => (run.totalMs < best.totalMs ? run : best));
  total += timing.totalMs;
  console.log(
    [
      one.name.padEnd(22),
      String(timing.frames).padStart(7),
      String(timing.kept).padStart(5),
      String(timing.spawns).padStart(7),
      seconds(timing.decodeMs).padStart(8),
      seconds(timing.classifyMs).padStart(9),
      seconds(timing.totalMs).padStart(8),
    ].join(" "),
  );
}

console.log(`${"total".padEnd(22)} ${"".padStart(7)} ${"".padStart(5)} ${"".padStart(7)} ${"".padStart(8)} ${"".padStart(9)} ${seconds(total).padStart(8)}`);
