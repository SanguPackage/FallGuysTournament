# Per-Run Capture Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every ffmpeg spawn its own segment folder so a restart or a crash-respawn can never overwrite footage, and date the clips and ledger keys so a later event cannot collide with an earlier one.

**Architecture:** `Recorder` asks a `newRun()` callback for a fresh folder per spawn and remembers every `{dir, startedAt}` it used. `Segment` carries the folder it came from, so the frame extractor and the clip cutter read across a crash split; `coverage()` reports whether the parts have a hole in them. `Moment` and `ShowClip` carry the event date, which puts the date into the ledger keys and the clip filenames.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun run`), ffmpeg on Windows driven from WSL.

**Spec:** `docs/superpowers/specs/2026-09-02-capture-run-folders-design.md`

---

## File Structure

| File                      | Responsibility after this plan                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/capture/paths.ts`    | Adds `runFolder(at)` — the name of one spawn's folder                                                          |
| `src/capture/segments.ts` | `Segment` carries `dir`; `Coverage` carries `gapped`                                                           |
| `src/capture/command.ts`  | `concatList` documented as taking absolute paths                                                               |
| `src/capture/pipeline.ts` | Reads `part.dir`; `segmentDir` leaves both dep types; list file goes to scratch; `cutShowClip` reports the gap |
| `src/capture/moments.ts`  | `Moment` and `ShowClip` carry `date`; keys use it                                                              |
| `src/capture/recorder.ts` | `newRun`, `argvFor(audio, runDir)`, `runs()`                                                                   |
| `scripts/serve.ts`        | Creates and prunes run folders, merges every run's CSV, dates the clip name                                    |
| `README.md`               | Describes the folder layout                                                                                    |

---

### Task 1: The run folder name

**Files:**

- Modify: `src/capture/paths.ts`
- Test: `src/capture/paths.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/capture/paths.test.ts`:

```ts
test("a run folder is named for the local clock, down to the second", () => {
  // Built from local parts so the expectation holds in any timezone.
  const at = new Date(2026, 8, 2, 21, 41, 3).getTime();
  expect(runFolder(at)).toBe("2026-09-02T21h41m03");
});

test("two runs a second apart get different folders", () => {
  const at = new Date(2026, 8, 2, 21, 41, 3).getTime();
  expect(runFolder(at)).not.toBe(runFolder(at + 1000));
});
```

And add `runFolder` to the existing import at the top of the file:

```ts
import {
  captureFolders,
  captureSettings,
  FFMPEG_DEFAULT,
  runFolder,
} from "./paths";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/capture/paths.test.ts`
Expected: FAIL — `runFolder` is not exported by `./paths`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/capture/paths.ts`:

```ts
/**
 * One spawn's folder. Local time, because the event is a local evening. Seconds are in it because
 * ffmpeg can die and be respawned inside the same minute, and two spawns sharing a folder is the
 * overwrite this whole layout exists to prevent.
 */
export function runFolder(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}h${pad(date.getMinutes())}m${pad(date.getSeconds())}`;
  return `${day}T${clock}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/capture/paths.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/paths.ts src/capture/paths.test.ts
git commit -m "Add run folder naming for capture segments"
```

---

### Task 2: Segments carry their folder, and coverage reports holes

A `Segment` currently means "a file in the one segment folder". It becomes "a file in the run folder that produced it", which is what lets the extractor and the cutter read across a crash split. `coverage()` gains `gapped`, because two runs stitched together have a hole between them that `complete` cannot see.

**Files:**

- Modify: `src/capture/segments.ts`
- Modify: `src/capture/pipeline.ts`
- Modify: `src/capture/command.ts` (comment only)
- Test: `src/capture/segments.test.ts`, `src/capture/pipeline.test.ts`, `src/capture/command.test.ts`

- [ ] **Step 1: Write the failing segments tests**

Replace the whole of `src/capture/segments.test.ts` with:

```ts
import { expect, test } from "bun:test";
import { coverage, offsetIn, parseSegments } from "./segments";

const START = Date.parse("2026-09-05T20:00:00Z");
const DIR = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T22h00m00";
const CSV = `seg-00000.mkv,0.000000,30.033000
seg-00001.mkv,30.033000,60.033000
seg-00002.mkv,60.033000,90.100000
`;

// A second run: ffmpeg died 90s in and was respawned 12s later, numbering from zero again.
const NEXT_DIR = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T22h01m42";
const NEXT_START = START + 102_000;
const NEXT_CSV = `seg-00000.mkv,0.000000,30.000000
`;

test("a csv row becomes a segment on the wall clock, in the run folder that wrote it", () => {
  const [first, , third] = parseSegments(CSV, START, DIR);
  expect(first).toEqual({
    file: "seg-00000.mkv",
    dir: DIR,
    from: START,
    to: START + 30_033,
  });
  expect(third!.from).toBe(START + 60_033);
});

test("a blank or partial csv yields no segments rather than throwing", () => {
  expect(parseSegments("", START, DIR)).toEqual([]);
  expect(parseSegments("seg-00000.mkv,0.000000\n", START, DIR)).toEqual([]);
});

test("a window inside one segment is covered by it alone", () => {
  const { parts, complete, gapped } = coverage(
    parseSegments(CSV, START, DIR),
    START + 5_000,
    START + 7_000,
  );
  expect(parts.map((part) => part.file)).toEqual(["seg-00000.mkv"]);
  expect(complete).toBe(true);
  expect(gapped).toBe(false);
});

test("a window straddling a boundary is covered by both segments, in order", () => {
  const { parts, complete, gapped } = coverage(
    parseSegments(CSV, START, DIR),
    START + 29_000,
    START + 31_000,
  );
  expect(parts.map((part) => part.file)).toEqual([
    "seg-00000.mkv",
    "seg-00001.mkv",
  ]);
  expect(complete).toBe(true);
  expect(gapped).toBe(false);
});

test("a window running past the last closed segment is not complete", () => {
  const { complete } = coverage(
    parseSegments(CSV, START, DIR),
    START + 89_000,
    START + 95_000,
  );
  expect(complete).toBe(false);
});

test("a window before the recording began is not complete", () => {
  const { complete } = coverage(
    parseSegments(CSV, START, DIR),
    START - 5_000,
    START + 1_000,
  );
  expect(complete).toBe(false);
});

test("a window spanning two runs is covered by both, and reported as gapped", () => {
  const segments = [
    ...parseSegments(CSV, START, DIR),
    ...parseSegments(NEXT_CSV, NEXT_START, NEXT_DIR),
  ];
  const { parts, complete, gapped } = coverage(
    segments,
    START + 80_000,
    START + 110_000,
  );
  expect(parts.map((part) => `${part.dir}/${part.file}`)).toEqual([
    `${DIR}/seg-00002.mkv`,
    `${NEXT_DIR}/seg-00000.mkv`,
  ]);
  expect(complete).toBe(true);
  expect(gapped).toBe(true);
});

test("an offset is seconds into the segment, never negative", () => {
  const [first] = parseSegments(CSV, START, DIR);
  expect(offsetIn(first!, START + 4_500)).toBeCloseTo(4.5);
  expect(offsetIn(first!, START - 1_000)).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/capture/segments.test.ts`
Expected: FAIL — `parseSegments` takes two arguments, and `gapped` is not on `Coverage`.

- [ ] **Step 3: Implement the segment changes**

In `src/capture/segments.ts`, replace the `Segment` interface, `parseSegments`, the `Coverage` interface and `coverage`:

```ts
export interface Segment {
  /** Filename as the muxer wrote it, relative to `dir`. */
  file: string;
  /** The run folder holding it. Each ffmpeg spawn numbers from zero into its own. */
  dir: string;
  /** Epoch ms of the segment's first frame. */
  from: number;
  /** Epoch ms just past its last frame. */
  to: number;
}

/**
 * The segment muxer's `-segment_list_type csv`: `file,startSeconds,endSeconds` against the stream.
 * A row appears only once its segment closes, so the segment being recorded is never in here.
 */
export function parseSegments(
  csv: string,
  recordingStartedAt: number,
  dir: string,
): Segment[] {
  const segments: Segment[] = [];
  for (const line of csv.split("\n")) {
    const [file, start, end] = line.trim().split(",");
    if (!file || start === undefined || end === undefined) continue;
    const from = Number(start);
    const to = Number(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    segments.push({
      file,
      dir,
      from: recordingStartedAt + from * 1000,
      to: recordingStartedAt + to * 1000,
    });
  }
  return segments;
}

/**
 * Inside a run one row's end is the next row's start, so anything above this is a run boundary:
 * the dead run's last segment was never closed, and the respawn took time on top of that.
 */
const GAP_MS = 1000;

export interface Coverage {
  /** The segments the window falls across, in order. */
  parts: Segment[];
  /** Whether they hold the whole window. One running past the last closed segment does not. */
  complete: boolean;
  /** Whether a recording died mid-window, leaving a hole between two parts. */
  gapped: boolean;
}

export function coverage(
  segments: Segment[],
  from: number,
  to: number,
): Coverage {
  const parts = segments
    .filter((segment) => segment.from < to && segment.to > from)
    .sort((a, b) => a.from - b.from);
  const first = parts[0];
  const last = parts.at(-1);
  const complete =
    first !== undefined &&
    last !== undefined &&
    first.from <= from &&
    last.to >= to;
  const gapped = parts.some(
    (part, index) => index > 0 && part.from - parts[index - 1]!.to > GAP_MS,
  );
  return { parts, complete, gapped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/capture/segments.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing concat list test**

In `src/capture/command.test.ts`, replace the concat list test with:

```ts
test("a concat list quotes one absolute path per line, as the demuxer wants", () => {
  expect(
    concatList([
      "C:\\caps\\segments\\21h41m03\\seg-00002.mkv",
      "C:\\caps\\segments\\21h43m00\\seg-00000.mkv",
    ]),
  ).toBe(
    "file 'C:\\caps\\segments\\21h41m03\\seg-00002.mkv'\nfile 'C:\\caps\\segments\\21h43m00\\seg-00000.mkv'\n",
  );
});
```

- [ ] **Step 6: Run it and confirm it already passes**

Run: `bun test src/capture/command.test.ts`
Expected: PASS. `concatList` needs no code change — only its comment is now wrong.

In `src/capture/command.ts`, replace the comment above `concatList`:

```ts
/** The concat demuxer's list format. Paths are absolute, because parts can span run folders. */
```

- [ ] **Step 7: Write the failing pipeline tests**

In `src/capture/pipeline.test.ts`, replace the `SEGMENTS` constant and the `harness` function:

```ts
const RUN = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T20h00m00";
const SEGMENTS = [
  { file: "seg-00003.mkv", dir: RUN, from: AT - 20_000, to: AT + 10_000 },
];

async function harness() {
  const dir = await mkdtemp(`${tmpdir()}/capture-`);
  const ran: string[][] = [];
  const scratchDir = `${dir}/scratch`;
  return {
    dir,
    ran,
    deps: {
      ffmpeg: "ff",
      scratchDir,
      captureDir: `${dir}/captures`,
      // Stands in for ffmpeg. The argv carries Windows paths, which this process cannot write to,
      // so the frames go where the pipeline will look for them instead.
      run: async (argv: string[]) => {
        ran.push(argv);
        const folder = `${scratchDir}/0-first-2`;
        await mkdir(folder, { recursive: true });
        for (const n of [1, 2]) {
          await writeFile(`${folder}/p0-000${n}.jpg`, "x");
        }
        return { ok: true, stderr: "" };
      },
      frameOf: async () => ({
        width: 2,
        height: 2,
        at: () => [0, 0, 0] as const,
      }),
      screenOf: () => "toast" as const,
    },
  };
}

test("a frame is pulled from the run folder its segment came from", async () => {
  const { dir, deps, ran } = await harness();
  try {
    await captureMoment(MOMENT, SEGMENTS, new Ledger(), deps);
    expect(ran[0]![ran[0]!.indexOf("-i") + 1]).toBe(
      "C:\\temp\\FallGuysCapture\\segments\\2026-09-05T20h00m00\\seg-00003.mkv",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

Then replace the two `cutShowClip` tests at the bottom of the file:

```ts
test("a clip is cut with the streams copied, and named after the show", async () => {
  const { dir, deps, ran } = await harness();
  const clip = { showIndex: 2, from: AT - 10_000, to: AT + 5_000 };
  const ledger = new Ledger();
  try {
    const cut = await cutShowClip(
      clip,
      SEGMENTS,
      "show-03-slime-climb",
      ledger,
      {
        ffmpeg: deps.ffmpeg,
        scratchDir: deps.scratchDir,
        showsDir: `${dir}/shows`,
        run: deps.run,
      },
    );
    expect(cut).toEqual({
      out: `${dir}/shows/show-03-slime-climb.mp4`,
      gapped: false,
    });
    expect(ran[0]).toContain("copy");
    expect(await Bun.file(`${dir}/scratch/clip-2.txt`).text()).toBe(
      `file 'C:\\temp\\FallGuysCapture\\segments\\2026-09-05T20h00m00\\seg-00003.mkv'\n`,
    );
    expect(ledger.pending("2:clip")).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip whose recording died inside it is cut anyway, and says so", async () => {
  const { dir, deps } = await harness();
  const later = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T20h01m00";
  const split = [
    { file: "seg-00003.mkv", dir: RUN, from: AT - 20_000, to: AT - 5_000 },
    { file: "seg-00000.mkv", dir: later, from: AT + 5_000, to: AT + 20_000 },
  ];
  try {
    const cut = await cutShowClip(
      { showIndex: 1, from: AT - 15_000, to: AT + 15_000 },
      split,
      "show-02-x",
      new Ledger(),
      {
        ffmpeg: deps.ffmpeg,
        scratchDir: deps.scratchDir,
        showsDir: `${dir}/shows`,
        run: deps.run,
      },
    );
    expect(cut?.gapped).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip the segments do not cover yet is left pending", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const cut = await cutShowClip(
      { showIndex: 0, from: AT - 60_000, to: AT },
      SEGMENTS,
      "show-01-x",
      ledger,
      {
        ffmpeg: deps.ffmpeg,
        scratchDir: deps.scratchDir,
        showsDir: `${dir}/shows`,
        run: deps.run,
      },
    );
    expect(cut).toBeUndefined();
    expect(ledger.pending("0:clip")).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

One more assertion names the scratch folder by hand:

```ts
expect(await Bun.file(`${dir}/scratch/0-first-2/p0-0001.jpg`).exists()).toBe(
  false,
);
```

Leave it as it is for now — Task 3 renames it, because the folder is named from the ledger key.

- [ ] **Step 8: Run tests to verify they fail**

Run: `bun test src/capture/pipeline.test.ts`
Expected: FAIL — `segmentDir` is still required by `CaptureDeps`, and the `-i` path still points at the old flat folder.

- [ ] **Step 9: Implement the pipeline changes**

In `src/capture/pipeline.ts`:

Drop `segmentDir` from `CaptureDeps`:

```ts
export interface CaptureDeps {
  ffmpeg: string;
  scratchDir: string;
  captureDir: string;
  run: (argv: string[]) => Promise<RunResult>;
  frameOf: (path: string) => Promise<Frame>;
  screenOf: (frame: Frame) => Screen | undefined;
}
```

In `captureMoment`, the extract call reads the part's own folder:

```ts
          segment: toWindows(`${part.dir}/${part.file}`),
```

Replace `ClipDeps` and the body of `cutShowClip` up to and including the `out` line:

```ts
export interface ClipDeps {
  ffmpeg: string;
  scratchDir: string;
  showsDir: string;
  run: (argv: string[]) => Promise<RunResult>;
}

export interface ClipResult {
  out: string;
  /** The clip jumps here: a recording died inside the window and the parts do not meet. */
  gapped: boolean;
}

/**
 * Cuts one show's mp4 out of the segments it spans. `-c copy`, so this is a file operation rather
 * than an encode; `-g` on the recording is what keeps the cut within about a second of `from`.
 *
 * A window with a hole in it is still cut. Refusing would spend the ledger's attempts and abandon
 * a show whose footage is on disk, and a clip that jumps is worth more than no clip.
 */
export async function cutShowClip(
  clip: ShowClip,
  segments: Segment[],
  name: string,
  ledger: Ledger,
  deps: ClipDeps,
): Promise<ClipResult | undefined> {
  const key = clipKey(clip);
  const { parts, complete, gapped } = coverage(segments, clip.from, clip.to);
  if (!complete) {
    ledger.failed(key);
    return undefined;
  }

  const list = `${deps.scratchDir}/clip-${clip.showIndex}.txt`;
  await mkdir(deps.scratchDir, { recursive: true });
  await Bun.write(list, concatList(parts.map((part) => toWindows(`${part.dir}/${part.file}`))));
  await mkdir(deps.showsDir, { recursive: true });

  const out = `${deps.showsDir}/${name}.mp4`;
```

and replace the tail of the function:

```ts
  if (!result.ok) {
    ledger.failed(key);
    return undefined;
  }
  ledger.done(key);
  return { out, gapped };
}
```

- [ ] **Step 10: Run the capture tests**

Run: `bun test src/capture/`
Expected: PASS, every file.

- [ ] **Step 11: Commit**

```bash
git add src/capture/segments.ts src/capture/segments.test.ts src/capture/pipeline.ts src/capture/pipeline.test.ts src/capture/command.ts src/capture/command.test.ts
git commit -m "Carry the run folder on each segment and report coverage gaps"
```

---

### Task 3: The event date on moments, clips and ledger keys

`momentKey` is `showIndex:kind:round` with no date, so a later event reads `0:clip` as already done and captures nothing for its first show. The date goes onto the moment itself rather than into the key function, so the key stays single-argument.

**Files:**

- Modify: `src/capture/moments.ts`
- Test: `src/capture/moments.test.ts`, `src/capture/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/capture/moments.test.ts`:

First add `clipKey` to the file's import, which currently reads:

```ts
import { clipKey, momentKey, momentsIn, showClips } from "./moments";
```

Then append, reusing the `SHOW` log fixture and `DATE` already at the top of the file:

```ts
test("a ledger key names the event, so a later one does not read as already captured", () => {
  const shows = parseLog(SHOW);
  const mine = momentKey(momentsIn(shows, DATE)[0]!);
  expect(mine).toStartWith(`${DATE}:`);
  expect(momentKey(momentsIn(shows, "2026-09-12")[0]!)).not.toBe(mine);
});

test("a clip key names the event too", () => {
  const [clip] = showClips(parseLog(SHOW), DATE);
  expect(clipKey(clip!)).toBe(`${DATE}:0:clip`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/capture/moments.test.ts`
Expected: FAIL — the key is `0:first:0`, with no date.

- [ ] **Step 3: Implement**

In `src/capture/moments.ts`, add `date` to both shapes:

```ts
export interface Moment {
  kind: MomentKind;
  showIndex: number;
  /** The round the moment belongs to. Absent on a winner, which belongs to the show. */
  roundIndex?: number;
  /** The event day. Without it a later event reads as already captured. */
  date: string;
  /** Epoch ms the log stamped the moment. */
  at: number;
  /** Epoch ms of the first and last frame worth pulling. */
  from: number;
  to: number;
  /**
   * Only the toast is racing a screen that can live for a fraction of a second. The grid and the
   * winner screen stand for many seconds, so pulling them at full rate only costs decoding.
   */
  fps: number;
}

export interface ShowClip {
  showIndex: number;
  /** The event day. Without it a later event reads as already captured. */
  date: string;
  from: number;
  to: number;
}
```

Give the `moment` helper the date:

```ts
function moment(
  kind: MomentKind,
  showIndex: number,
  date: string,
  at: number,
  roundIndex?: number,
): Moment {
  const window = WINDOW[kind];
  return {
    kind,
    showIndex,
    ...(roundIndex === undefined ? {} : { roundIndex }),
    date,
    at,
    from: at + window.from,
    to: at + window.to,
    fps: window.fps,
  };
}
```

Pass it at all three call sites in `momentsIn`:

```ts
if (at !== undefined)
  moments.push(moment("first", showIndex, date, at, roundIndex));
```

```ts
if (boardAt !== undefined)
  moments.push(moment("finalists", showIndex, date, boardAt, before));
```

```ts
if (span.wonAt !== undefined)
  moments.push(moment("winner", showIndex, date, span.wonAt));
```

And in `showClips`:

```ts
clips.push({ showIndex, date, from: from - CLIP_HEAD, to: end + CLIP_TAIL });
```

Then the keys:

```ts
/** What the ledger remembers a moment by, so a restart captures nothing twice. */
export function momentKey(moment: Moment): string {
  return `${moment.date}:${moment.showIndex}:${moment.kind}:${moment.roundIndex ?? "-"}`;
}

export function clipKey(clip: ShowClip): string {
  return `${clip.date}:${clip.showIndex}:clip`;
}
```

- [ ] **Step 4: Fix the pipeline test fixtures**

The scratch folder is named from the key, so it moves. In `src/capture/pipeline.test.ts`, add `date` to `MOMENT`:

```ts
const MOMENT: Moment = {
  kind: "first",
  showIndex: 0,
  roundIndex: 2,
  date: "2026-09-05",
  at: AT,
  from: AT - 500,
  to: AT + 1500,
  fps: 30,
};
```

change the folder the fake `run` writes into:

```ts
const folder = `${scratchDir}/2026-09-05-0-first-2`;
```

rename the scratch folder in the assertion Task 2 left alone:

```ts
expect(
  await Bun.file(`${dir}/scratch/2026-09-05-0-first-2/p0-0001.jpg`).exists(),
).toBe(false);
```

change all three `ledger.pending("0:first:2")` calls to `ledger.pending("2026-09-05:0:first:2")`,
and add `date: "2026-09-05"` to the four `ShowClip` literals — the `clip` const and the three
inline `{ showIndex: … }` objects — then update their key assertions to `"2026-09-05:2:clip"` and
`"2026-09-05:0:clip"`.

- [ ] **Step 5: Run the whole suite**

Run: `bun test`
Expected: PASS. `scripts/serve.ts` is not under test and does not need to compile for this to pass — it is fixed in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/capture/moments.ts src/capture/moments.test.ts src/capture/pipeline.test.ts
git commit -m "Key captured moments and clips by event date"
```

---

### Task 4: The recorder owns its runs

**Files:**

- Modify: `src/capture/recorder.ts`
- Test: `src/capture/recorder.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/capture/recorder.test.ts`, replace the `argvFor` constant and append the two new tests:

```ts
const argvFor = (audio: boolean, runDir: string) =>
  audio ? ["ff", "-i", "audio", runDir] : ["ff", "silent", runDir];

function runs() {
  let n = 0;
  return () => `/caps/segments/run-${++n}`;
}

test("each spawn records into a folder of its own", async () => {
  const { spawn, calls } = fakeSpawn([1, -1]);
  const recorder = new Recorder({
    argvFor,
    newRun: runs(),
    spawn,
    now: () => 2000,
    retryMs: 1,
  });
  recorder.start();
  await Bun.sleep(20);
  expect(calls.map((argv) => argv.at(-1))).toEqual([
    "/caps/segments/run-1",
    "/caps/segments/run-2",
  ]);
  recorder.stop();
});

test("every run is remembered with the clock it started on, so a crash loses nothing", async () => {
  const { spawn } = fakeSpawn([1, -1]);
  let clock = 5000;
  const recorder = new Recorder({
    argvFor,
    newRun: runs(),
    spawn,
    now: () => (clock += 1000),
    retryMs: 1,
  });
  recorder.start();
  await Bun.sleep(20);
  expect(recorder.runs()).toEqual([
    { dir: "/caps/segments/run-1", startedAt: 6000 },
    { dir: "/caps/segments/run-2", startedAt: 7000 },
  ]);
  recorder.stop();
});
```

Then add `newRun: runs(),` to the options object of every other `new Recorder({...})` already in the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/capture/recorder.test.ts`
Expected: FAIL — `newRun` is not a `RecorderOptions` property, and `runs` is not a method.

- [ ] **Step 3: Implement**

In `src/capture/recorder.ts`, add the `Run` shape and extend the options:

```ts
export interface Run {
  /** The folder this spawn's segments and CSV are in. */
  dir: string;
  /** Wall clock the spawn started, which its segment times are measured from. */
  startedAt: number;
}

export interface RecorderOptions {
  argvFor: (audio: boolean, runDir: string) => string[];
  /** A folder for the next spawn. Called once per spawn and never reused. */
  newRun: () => string;
  spawn: (argv: string[]) => Spawned;
  now: () => number;
  /** How long to wait before starting a recording again after one died. */
  retryMs?: number;
}
```

Add the field and accessor to the class:

```ts
  private readonly runList: Run[] = [];
```

```ts
  /** Every spawn this recorder has made. A crash-respawn adds one rather than replacing it. */
  runs(): Run[] {
    return [...this.runList];
  }
```

And in `loop`, take the folder before spawning:

```ts
const startedAt = this.options.now();
const dir = this.options.newRun();
this.runList.push({ dir, startedAt });
const process = this.options.spawn(this.options.argvFor(this.audio, dir));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/capture/recorder.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/recorder.ts src/capture/recorder.test.ts
git commit -m "Give every recording run its own folder and remember it"
```

---

### Task 5: Wire it up in the server

`scripts/serve.ts` has no test file — it is the wiring, and everything it wires is tested. Verify it by type-checking and by starting it.

**Files:**

- Modify: `scripts/serve.ts:16-25`, `scripts/serve.ts:155-230`, `scripts/serve.ts:374`

- [ ] **Step 1: Add the imports**

Change the capture imports near the top of `scripts/serve.ts`:

```ts
import { parseSegments, type Segment } from "../src/capture/segments";
import {
  captureFolders,
  captureSettings,
  runFolder,
} from "../src/capture/paths";
```

and add the node fs import beside the existing `mkdir` one:

```ts
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
```

- [ ] **Step 2: Add the run folder factory**

Insert directly above `const recorder = new Recorder({`:

```ts
let lastRun: string | undefined;

/**
 * A folder per ffmpeg spawn, so a restart or a crash-respawn never numbers over the last one.
 *
 * The spawn before is dropped when it caught nothing: an input that will not open dies in under
 * three seconds and is retried at once, which would otherwise leave an empty folder every time.
 * Synchronous because the recorder asks for the folder in the same breath as it spawns.
 */
function newRun(): string {
  if (lastRun && !readdirSync(lastRun).some((name) => name.endsWith(".mkv"))) {
    rmSync(lastRun, { recursive: true, force: true });
  }
  const base = `${folders.segments}/${runFolder(Date.now())}`;
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  lastRun = dir;
  return dir;
}
```

- [ ] **Step 3: Point the recorder at it**

In the `new Recorder({...})` call, change `argvFor` and add `newRun`:

```ts
const recorder = new Recorder({
  argvFor: (audio, runDir) =>
    recordArgv({
      ffmpeg: capture.ffmpeg!,
      output: capture.output,
      ...(audio && capture.audioDevice
        ? { audioDevice: capture.audioDevice }
        : {}),
      dir: toWindows(runDir),
      fps: 30,
      segmentSeconds: 30,
    }),
  newRun,
  spawn: (argv) => {
    const child = Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" });
    return { exited: child.exited, kill: () => child.kill() };
  },
  now: () => Date.now(),
});
```

- [ ] **Step 4: Merge every run's CSV**

Replace `segmentsNow`:

```ts
/**
 * Every run's segments, oldest first. The muxer only lists a segment once it closes, so the one
 * recording now is never in here, and a run that died before closing one contributes nothing.
 */
async function segmentsNow(): Promise<Segment[]> {
  const segments: Segment[] = [];
  for (const run of recorder.runs()) {
    const csv = await Bun.file(`${run.dir}/segments.csv`)
      .text()
      .catch(() => "");
    segments.push(...parseSegments(csv, run.startedAt, run.dir));
  }
  return segments;
}
```

- [ ] **Step 5: Date the clip name**

Replace `clipName`:

```ts
function clipName(
  shows: ParsedShow[],
  showIndex: number,
  date: string,
): string {
  const slug = suggestShowName(shows, showIndex)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${date}-show-${String(showIndex + 1).padStart(2, "0")}-${slug}`;
}
```

- [ ] **Step 6: Update the sweep**

In `sweepCaptures`, the moment job loses `segmentDir`:

```ts
await captureMoment(moment, segments, ledger, {
  ffmpeg: capture.ffmpeg!,
  scratchDir: folders.scratch,
  captureDir: folders.captures,
  run: runFfmpeg,
  frameOf: frameFrom,
  screenOf: identify,
});
```

and the clip job takes the date and reports a gap:

```ts
for (const clip of showClips(shows, event.date)) {
  if (!ledger.pending(clipKey(clip))) continue;
  const name = clipName(shows, clip.showIndex, event.date);
  captureJobs.add(async () => {
    const cut = await cutShowClip(clip, segments, name, ledger, {
      ffmpeg: capture.ffmpeg!,
      scratchDir: folders.scratch,
      showsDir: folders.shows,
      run: runFfmpeg,
    });
    if (cut?.gapped)
      console.log(
        `${name}.mp4 — a recording died inside it, so the clip jumps`,
      );
  });
}
```

- [ ] **Step 7: Type-check and run the suite**

Run: `bunx tsc --noEmit && bun test`
Expected: no type errors, all tests pass.

- [ ] **Step 8: Start the server and confirm the folder appears**

Run: `bun run dev`
Expected: the console prints `Recording     on — …/capture/segments` (or `off — no ffmpeg found` on a machine without it, which is a valid result — say so rather than claiming it recorded).

If ffmpeg is present, in another shell:

```bash
ls capture/segments/
```

Expected: one folder named like `2026-09-02T21h41m03`, holding `seg-00000.mkv` and `segments.csv` once thirty seconds have passed. Stop the server, start it again, and confirm a **second** folder appears rather than the first being renumbered.

- [ ] **Step 9: Commit**

```bash
git add scripts/serve.ts
git commit -m "Record into a folder per run and read across a crash"
```

---

### Task 6: Document the layout

**Files:**

- Modify: `README.md:262-265`

- [ ] **Step 1: Replace the paragraph**

Replace the paragraph beginning `One mp4 per show lands in` with:

```markdown
One mp4 per show lands in `CAPTURE_DIR/shows`, named `2026-09-02-show-01-slime-climb.mp4`, cut from
the first round to just past the victory screen without re-encoding. The raw recording sits under
`CAPTURE_DIR/segments` in one folder per run, stamped `2026-09-02T21h41m03`: every start of the
server, and every recovery from an ffmpeg that died mid-event, gets its own, so nothing ever writes
over footage that is already there. A clip cut across such a recovery has a jump in it, and the
console says which one. Nothing is cleaned up: `CAPTURE_DIR` is yours to empty. A static desktop
runs about 1.7 Mbps, so budget a few gigabytes an hour and leave 30GB free.
```

- [ ] **Step 2: Check the formatting**

Run: `bunx prettier --check README.md`
Expected: no warning. If it warns, run `bunx prettier --write README.md`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the per-run capture layout"
```
