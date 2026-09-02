# Automatic capture implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the screen for the whole event, then cut the frames the OCR needs out of that recording using the clock stamp inside each `Player.log` line, and cut one mp4 per show.

**Architecture:** One long-lived ffmpeg writes 30-second segments plus a `segments.csv` naming each segment's stream times. A background loop reads the log, derives the moments that matter, maps each moment's epoch-millisecond timestamp onto a segment and an offset, extracts frames, keeps only those the existing `identify()` accepts, and writes them into a second shots root with their mtime set to the moment they show — so `placeShots`, `ReadQueue` and autofill treat them exactly like ShareX captures.

**Tech Stack:** Bun, TypeScript, `bun test`. `ffmpeg.exe` bundled with ShareX (`C:\Program Files\ShareX\ffmpeg.exe`, v8.1.1) with `ddagrab` + `h264_qsv`. Existing `jimp` for decoding, existing `tesseract.js` untouched. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-02-auto-capture-design.md](../specs/2026-09-02-auto-capture-design.md)

---

## Verified before writing this plan

Every ffmpeg invocation below was run against this machine. Do not re-litigate these:

| Fact                                                             | Consequence                              |
|------------------------------------------------------------------|------------------------------------------|
| `h264_nvenc` fails ("no encode device"), `h264_amf` fails         | Use `h264_qsv`; `libx264` is the fallback |
| `ddagrab` works on `output_idx=0` and `output_idx=1`             | The monitor is an env var, not a guess    |
| `-segment_list_type csv` writes `seg-00000.mkv,0.000000,2.067000` | That is the exact format `segments.ts` parses |
| A missing dshow audio device exits nonzero within a second        | Video-only fallback can be triggered on exit code |
| `-f concat -safe 0` + `-ss/-to -c copy` cuts across segments      | Show clips need no re-encode              |
| No `ffprobe.exe` ships with ShareX                                | Never shell out to ffprobe                |

## File structure

| File                            | Responsibility                                                        |
|---------------------------------|-----------------------------------------------------------------------|
| `src/log.ts`                    | Modified: records when a round's first qualifier came in               |
| `src/screenshots.ts`            | Modified: `Shot.source`, and `firsts` in `ShowTimes`                   |
| `src/shot-folder.ts`            | Modified: a listing knows which root it came from                      |
| `src/capture/moments.ts`        | Parsed log → the moments worth capturing, and the show clip windows    |
| `src/capture/segments.ts`       | `segments.csv` + a recording start → which file holds a given instant  |
| `src/capture/command.ts`        | Every ffmpeg argv this feature runs                                    |
| `src/capture/pick.ts`           | Extracted frames → the few worth keeping                               |
| `src/capture/ledger.ts`         | What has already been captured, across restarts                        |
| `src/capture/serial.ts`         | One background job at a time                                           |
| `src/capture/win-path.ts`       | WSL paths → the `C:\` form ffmpeg needs for its file arguments          |
| `src/capture/paths.ts`          | Where ffmpeg, the recording folder and the capture root are            |
| `src/capture/recorder.ts`       | Spawns and supervises the long ffmpeg; reports liveness                |
| `src/capture/pipeline.ts`       | Wires moments → extract → pick → write, and cuts show clips            |
| `scripts/serve.ts`              | Modified: `--record`, the poll loop, capture status in `/api/state`    |
| `site/admin.ts`, `admin.html`   | Modified: the recorder badge, and `source` on the shot URL             |
| `README.md`                     | Modified: how to run it, and the pre-event checklist                   |

Tasks 1–10 are pure and independently committable. Tasks 11–17 wire them up.

---

### Task 1: The log records when a round's first qualifier came in

`endedAt` is the *last* progress line. The toast appears at the *first* one, and nothing records it.

**Files:**
- Modify: `src/log.ts:16` (the `ParsedRound` interface), `src/log.ts:98-104` (the `PROGRESS` branch)
- Test: `src/log.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/log.test.ts`:

```ts
test("a round records when its first qualifier came in, not its first result", () => {
  const [round] = parseLog(SHOW)[0]!.rounds;
  expect(round!.firstQualifiedAt).toBe("20:25:20.616");
});

test("a round nobody qualified from records no first", () => {
  const show = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:09.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=False
`)[0]!;
  expect(show.rounds[0]!.firstQualifiedAt).toBeUndefined();
});
```

The first test matters because in `SHOW` the line before the first `succeeded=True` is a
`succeeded=False` at `20:25:20.615` — an implementation that stamps the first progress line of any
kind passes nothing but this test catches it.

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/log.test.ts`
Expected: FAIL — `expected "20:25:20.616" to be undefined`.

- [ ] **Step 3: Add the field**

In `src/log.ts`, inside `interface ParsedRound`, after the `endedAt` field:

```ts
  /** When the round's first qualifier came in, which is when the trophy pill appeared. */
  firstQualifiedAt?: string;
```

- [ ] **Step 4: Stamp it**

Replace the `PROGRESS` branch in `src/log.ts`:

```ts
    const progress = PROGRESS.exec(line);
    if (progress && round) {
      if (at !== undefined) round.endedAt = at;
      const id = Number(progress[1]);
      if (progress[2] === "True") {
        if (round.qualified.length === 0 && at !== undefined) round.firstQualifiedAt = at;
        round.qualified.push(id);
      } else {
        round.eliminated.push(id);
      }
      continue;
    }
```

- [ ] **Step 5: Run the tests**

Run: `bun test src/log.test.ts`
Expected: PASS, all of them.

- [ ] **Step 6: Commit**

```bash
git add src/log.ts src/log.test.ts
git commit -m "feat: stamp when a round's first qualifier came in"
```

---

### Task 2: Absolute times carry the first-qualifier stamp

`absoluteTimes` turns the log's clock into epoch milliseconds. It must carry the new stamp, and the
clock reader only rolls the day over correctly if stamps reach it in order — so the read must sit
between `startedAt` and `endedAt`.

**Files:**
- Modify: `src/screenshots.ts:36-42` (`ShowTimes`), `src/screenshots.ts:66-79` (`absoluteTimes`)
- Test: `src/screenshots.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/screenshots.test.ts`:

```ts
test("absolute times carry each round's first qualifier", () => {
  const shows = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:20.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:00:25.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
`);
  const [times] = absoluteTimes(shows, "2026-09-05");
  expect(times!.firsts).toEqual([Date.parse("2026-09-05T20:00:20Z")]);
  expect(times!.ends).toEqual([Date.parse("2026-09-05T20:00:25Z")]);
});
```

If `parseLog` and `absoluteTimes` are not already imported at the top of that file, add them:

```ts
import { parseLog } from "./log";
import { absoluteTimes } from "./screenshots";
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/screenshots.test.ts`
Expected: FAIL — `firsts` is undefined.

- [ ] **Step 3: Add the field to `ShowTimes`**

In `src/screenshots.ts`, inside `interface ShowTimes`, after `rounds`:

```ts
  /** When each round's first qualifier came in, which is when the trophy pill appeared. */
  firsts: (number | undefined)[];
```

- [ ] **Step 4: Read it in order**

Replace the body of the `shows.map` callback in `absoluteTimes`:

```ts
  return shows.map((show) => {
    const startedAt = read(show.startedAt);
    const rounds: (number | undefined)[] = [];
    const firsts: (number | undefined)[] = [];
    const ends: (number | undefined)[] = [];
    for (const round of show.rounds) {
      rounds.push(read(round.startedAt));
      firsts.push(read(round.firstQualifiedAt));
      ends.push(read(round.endedAt));
    }
    return { startedAt, rounds, firsts, ends, wonAt: read(show.wonAt) };
  });
```

- [ ] **Step 5: Run the whole suite**

Run: `bun test && bun run typecheck`
Expected: PASS. `ShowTimes` gained a required field, so any other construction of it in tests will
fail to typecheck — fix those by adding `firsts: []`.

- [ ] **Step 6: Commit**

```bash
git add src/screenshots.ts src/screenshots.test.ts
git commit -m "feat: carry the first-qualifier stamp into absolute times"
```

---

### Task 3: Moments

Pure: a parsed log and the event date in, the list of instants worth pulling frames from out.

**Files:**
- Create: `src/capture/moments.ts`
- Test: `src/capture/moments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/moments.test.ts
import { expect, test } from "bun:test";
import { parseLog } from "../log";
import { momentKey, momentsIn, showClips } from "./moments";

const DATE = "2026-09-05";
const at = (clock: string) => Date.parse(`${DATE}T${clock}Z`);

const SHOW = `
20:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
20:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:00:44.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:01:00.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1s
20:01:30.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:01:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

test("every round with a qualifier yields a first moment, windowed around it", () => {
  const firsts = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "first");
  expect(firsts.map((m) => [m.roundIndex, m.at, m.from, m.to, m.fps])).toEqual([
    [0, at("20:00:40"), at("20:00:40") - 500, at("20:00:40") + 1500, 30],
    [1, at("20:01:30"), at("20:01:30") - 500, at("20:01:30") + 1500, 30],
  ]);
});

test("the finalists moment follows the round before the final, not the final", () => {
  const [finalists] = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "finalists");
  expect(finalists!.roundIndex).toBe(0);
  expect(finalists!.at).toBe(at("20:00:44"));
  expect([finalists!.from, finalists!.to, finalists!.fps]).toEqual([
    at("20:00:44") + 1000,
    at("20:00:44") + 6000,
    2,
  ]);
});

test("the winner moment comes off the victory scene", () => {
  const [winner] = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "winner");
  expect(winner!.roundIndex).toBeUndefined();
  expect([winner!.at, winner!.from, winner!.to, winner!.fps]).toEqual([
    at("20:01:35"),
    at("20:01:35") + 2000,
    at("20:01:35") + 8000,
    2,
  ]);
});

test("a one-round show has no finalists moment", () => {
  const moments = momentsIn(
    parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
`),
    DATE,
  );
  expect(moments.filter((m) => m.kind === "finalists")).toEqual([]);
});

test("a show still being played yields no clip", () => {
  expect(
    showClips(
      parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
`),
      DATE,
    ),
  ).toEqual([]);
});

test("a won show is clipped from its first round to past the victory scene", () => {
  const [clip] = showClips(parseLog(SHOW), DATE);
  expect([clip!.showIndex, clip!.from, clip!.to]).toEqual([
    0,
    at("20:00:05") - 5000,
    at("20:01:35") + 15000,
  ]);
});

test("a show with no victory scene is clipped to past its last result", () => {
  const [clip] = showClips(
    parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is a IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:44.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:05:00.000: [HandleSuccessfulLogin] Selected show is b IsUltimatePartyEpisode: False
`),
    DATE,
  );
  expect([clip!.showIndex, clip!.from, clip!.to]).toEqual([
    0,
    at("20:00:05") - 5000,
    at("20:00:44") + 15000,
  ]);
});

test("a moment's key is stable and tells the three kinds apart", () => {
  const moments = momentsIn(parseLog(SHOW), DATE);
  const keys = moments.map(momentKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain("0:first:1");
  expect(keys).toContain("0:winner:-");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/moments.test.ts`
Expected: FAIL — cannot resolve `./moments`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/moments.ts
import { absoluteTimes } from "../screenshots";
import type { ParsedShow } from "../log";

export type MomentKind = "first" | "finalists" | "winner";

export interface Moment {
  kind: MomentKind;
  showIndex: number;
  /** The round the moment belongs to. Absent on a winner, which belongs to the show. */
  roundIndex?: number;
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
  from: number;
  to: number;
}

/** Milliseconds either side of the stamp, so a negative `from` starts before it. */
const WINDOW: Record<MomentKind, { from: number; to: number; fps: number }> = {
  first: { from: -500, to: 1500, fps: 30 },
  finalists: { from: 1000, to: 6000, fps: 2 },
  winner: { from: 2000, to: 8000, fps: 2 },
};

/** How far past the last thing that happened a clip runs, so the screen that follows is in it. */
const CLIP_TAIL = 15_000;
/** How far before the first round a clip starts, so the level reveal is in it. */
const CLIP_HEAD = 5_000;

function moment(
  kind: MomentKind,
  showIndex: number,
  at: number,
  roundIndex?: number,
): Moment {
  const window = WINDOW[kind];
  return {
    kind,
    showIndex,
    ...(roundIndex === undefined ? {} : { roundIndex }),
    at,
    from: at + window.from,
    to: at + window.to,
    fps: window.fps,
  };
}

/** Every instant in the log worth pulling frames from, in the order they happened. */
export function momentsIn(shows: ParsedShow[], date: string): Moment[] {
  const times = absoluteTimes(shows, date);
  const moments: Moment[] = [];

  shows.forEach((show, showIndex) => {
    const span = times[showIndex]!;

    span.firsts.forEach((at, roundIndex) => {
      if (at !== undefined) moments.push(moment("first", showIndex, at, roundIndex));
    });

    // The board comes up after every round, so it only names finalists after the one before the
    // final. Same placement the capture panel uses.
    const before = show.rounds.length - 2;
    const boardAt = before >= 0 ? span.ends[before] : undefined;
    if (boardAt !== undefined) moments.push(moment("finalists", showIndex, boardAt, before));

    if (span.wonAt !== undefined) moments.push(moment("winner", showIndex, span.wonAt));
  });

  return moments.sort((a, b) => a.at - b.at);
}

/** One clip per show that has finished. A show still being played has no end to cut to. */
export function showClips(shows: ParsedShow[], date: string): ShowClip[] {
  const times = absoluteTimes(shows, date);
  const clips: ShowClip[] = [];

  shows.forEach((show, showIndex) => {
    const span = times[showIndex]!;
    const from = span.rounds.find((start) => start !== undefined);
    if (from === undefined) return;

    const moved = times.slice(showIndex + 1).some((next) => next.startedAt !== undefined);
    const lastResult = [...span.ends].reverse().find((end) => end !== undefined);
    const end = span.wonAt ?? (moved ? lastResult : undefined);
    if (end === undefined) return;

    clips.push({ showIndex, from: from - CLIP_HEAD, to: end + CLIP_TAIL });
  });

  return clips;
}

/** What the ledger remembers a moment by, so a restart captures nothing twice. */
export function momentKey(moment: Moment): string {
  return `${moment.showIndex}:${moment.kind}:${moment.roundIndex ?? "-"}`;
}

export function clipKey(clip: ShowClip): string {
  return `${clip.showIndex}:clip`;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/moments.test.ts`
Expected: PASS, eight tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/moments.ts src/capture/moments.test.ts
git commit -m "feat: derive the moments worth capturing from the log"
```

---

### Task 4: Segments

Pure: the muxer's csv plus the wall clock at which ffmpeg was spawned, in; which file holds a given
instant, and where in it, out.

**Files:**
- Create: `src/capture/segments.ts`
- Test: `src/capture/segments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/segments.test.ts
import { expect, test } from "bun:test";
import { coverage, offsetIn, parseSegments } from "./segments";

const START = Date.parse("2026-09-05T20:00:00Z");
const CSV = `seg-00000.mkv,0.000000,30.033000
seg-00001.mkv,30.033000,60.033000
seg-00002.mkv,60.033000,90.100000
`;

test("a csv row becomes a segment on the wall clock", () => {
  const [first, , third] = parseSegments(CSV, START);
  expect(first).toEqual({ file: "seg-00000.mkv", from: START, to: START + 30_033 });
  expect(third!.from).toBe(START + 60_033);
});

test("a blank or partial csv yields no segments rather than throwing", () => {
  expect(parseSegments("", START)).toEqual([]);
  expect(parseSegments("seg-00000.mkv,0.000000\n", START)).toEqual([]);
});

test("a window inside one segment is covered by it alone", () => {
  const { parts, complete } = coverage(parseSegments(CSV, START), START + 5_000, START + 7_000);
  expect(parts.map((part) => part.file)).toEqual(["seg-00000.mkv"]);
  expect(complete).toBe(true);
});

test("a window straddling a boundary is covered by both segments, in order", () => {
  const { parts, complete } = coverage(parseSegments(CSV, START), START + 29_000, START + 31_000);
  expect(parts.map((part) => part.file)).toEqual(["seg-00000.mkv", "seg-00001.mkv"]);
  expect(complete).toBe(true);
});

test("a window running past the last closed segment is not complete", () => {
  const { complete } = coverage(parseSegments(CSV, START), START + 89_000, START + 95_000);
  expect(complete).toBe(false);
});

test("a window before the recording began is not complete", () => {
  const { complete } = coverage(parseSegments(CSV, START), START - 5_000, START + 1_000);
  expect(complete).toBe(false);
});

test("an offset is seconds into the segment, never negative", () => {
  const [first] = parseSegments(CSV, START);
  expect(offsetIn(first!, START + 4_500)).toBeCloseTo(4.5);
  expect(offsetIn(first!, START - 1_000)).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/segments.test.ts`
Expected: FAIL — cannot resolve `./segments`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/segments.ts

export interface Segment {
  /** Filename as the muxer wrote it, relative to the segment folder. */
  file: string;
  /** Epoch ms of the segment's first frame. */
  from: number;
  /** Epoch ms just past its last frame. */
  to: number;
}

/**
 * The segment muxer's `-segment_list_type csv`: `file,startSeconds,endSeconds` against the stream.
 * A row appears only once its segment closes, so the segment being recorded is never in here.
 */
export function parseSegments(csv: string, recordingStartedAt: number): Segment[] {
  const segments: Segment[] = [];
  for (const line of csv.split("\n")) {
    const [file, start, end] = line.trim().split(",");
    if (!file || start === undefined || end === undefined) continue;
    const from = Number(start);
    const to = Number(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    segments.push({
      file,
      from: recordingStartedAt + from * 1000,
      to: recordingStartedAt + to * 1000,
    });
  }
  return segments;
}

export interface Coverage {
  /** The segments the window falls across, in order. */
  parts: Segment[];
  /** Whether they hold the whole window. A window that runs past the last closed segment does not. */
  complete: boolean;
}

export function coverage(segments: Segment[], from: number, to: number): Coverage {
  const parts = segments.filter((segment) => segment.from < to && segment.to > from);
  const first = parts[0];
  const last = parts.at(-1);
  const complete = first !== undefined && last !== undefined && first.from <= from && last.to >= to;
  return { parts, complete };
}

/** Seconds into a segment an instant falls, for ffmpeg's `-ss`. */
export function offsetIn(segment: Segment, at: number): number {
  return Math.max(0, (at - segment.from) / 1000);
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/segments.test.ts`
Expected: PASS, seven tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/segments.ts src/capture/segments.test.ts
git commit -m "feat: map an instant onto the segment holding it"
```

---

### Task 5: Commands

Every ffmpeg argv lives here, so the arguments can be asserted and only a thin runner is left
untested. All four shapes below were run by hand against this machine before this plan was written.

**Files:**
- Create: `src/capture/command.ts`
- Test: `src/capture/command.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/command.test.ts
import { expect, test } from "bun:test";
import { concatList, cutArgv, extractArgv, recordArgv } from "./command";

// The binary is launched by Bun, so it stays in WSL form. Every path handed *to* ffmpeg has been
// through toWindows by the time it reaches here.
const FFMPEG = "/mnt/c/Program Files/ShareX/ffmpeg.exe";

test("recording grabs the named monitor and segments with a csv list", () => {
  const argv = recordArgv({
    ffmpeg: FFMPEG,
    output: 1,
    audioDevice: "virtual-audio-capturer",
    dir: "C:\\FallGuysCapture\\segments",
    fps: 30,
    segmentSeconds: 30,
  });
  expect(argv[0]).toBe(FFMPEG);
  expect(argv).toContain("ddagrab=output_idx=1:framerate=30,hwdownload,format=bgra");
  expect(argv).toContain("audio=virtual-audio-capturer");
  expect(argv).toContain("h264_qsv");
  expect(argv).toContain("aac");
  expect(argv).toContain("C:\\FallGuysCapture\\segments\\segments.csv");
  expect(argv.at(-1)).toBe("C:\\FallGuysCapture\\segments\\seg-%05d.mkv");
  // A keyframe every second is what bounds a -c copy cut to ~1s of where it was asked to start.
  expect(argv[argv.indexOf("-g") + 1]).toBe("30");
});

test("recording without an audio device asks for no audio at all", () => {
  const argv = recordArgv({
    ffmpeg: FFMPEG,
    output: 0,
    dir: "C:\\seg",
    fps: 30,
    segmentSeconds: 30,
  });
  expect(argv).not.toContain("-f");
  expect(argv.join(" ")).not.toContain("dshow");
  expect(argv).not.toContain("aac");
});

test("extraction seeks the segment, takes a duration, and numbers the frames", () => {
  const argv = extractArgv({
    ffmpeg: FFMPEG,
    segment: "C:\\seg\\seg-00003.mkv",
    offset: 12.5,
    duration: 2,
    fps: 30,
    pattern: "C:\\scratch\\f-%04d.jpg",
  });
  expect(argv[argv.indexOf("-ss") + 1]).toBe("12.5");
  expect(argv[argv.indexOf("-t") + 1]).toBe("2");
  expect(argv[argv.indexOf("-i") + 1]).toBe("C:\\seg\\seg-00003.mkv");
  expect(argv).toContain("fps=30");
  expect(argv.at(-1)).toBe("C:\\scratch\\f-%04d.jpg");
  // -ss before -i is the fast seek; after -i it decodes the whole segment to get there.
  expect(argv.indexOf("-ss")).toBeLessThan(argv.indexOf("-i"));
});

test("a concat list quotes one file per line, as the demuxer wants", () => {
  expect(concatList(["seg-00000.mkv", "seg-00001.mkv"])).toBe(
    "file 'seg-00000.mkv'\nfile 'seg-00001.mkv'\n",
  );
});

test("a cut copies the streams rather than re-encoding them", () => {
  const argv = cutArgv({
    ffmpeg: FFMPEG,
    list: "C:\\seg\\list-3.txt",
    offset: 4,
    duration: 620.5,
    out: "C:\\FallGuysCapture\\shows\\show-03-slime-climb.mp4",
  });
  expect(argv).toContain("concat");
  expect(argv[argv.indexOf("-i") + 1]).toBe("C:\\seg\\list-3.txt");
  expect(argv[argv.indexOf("-ss") + 1]).toBe("4");
  expect(argv[argv.indexOf("-t") + 1]).toBe("620.5");
  expect(argv[argv.indexOf("-c") + 1]).toBe("copy");
  expect(argv.at(-1)).toBe("C:\\FallGuysCapture\\shows\\show-03-slime-climb.mp4");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/command.test.ts`
Expected: FAIL — cannot resolve `./command`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/command.ts

/**
 * Every path in an argv here is already in Windows form — ffmpeg is a Windows process and cannot
 * see `/mnt/c`. The binary itself is the exception: Bun launches it, so it stays a WSL path.
 */
function win(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, "")}\\${name}`;
}

const QUIET = ["-hide_banner", "-loglevel", "error", "-y"];

export interface RecordOptions {
  ffmpeg: string;
  /** Which `ddagrab` desktop to grab. Monitors are numbered from 0. */
  output: number;
  /** A dshow audio device name, or nothing for a silent recording. */
  audioDevice?: string;
  dir: string;
  fps: number;
  segmentSeconds: number;
}

/**
 * `h264_qsv` because this machine's encode hardware is the Intel iGPU: `h264_nvenc` reports no
 * encode device and `h264_amf` fails outright. mkv because it survives the process being killed.
 */
export function recordArgv(o: RecordOptions): string[] {
  return [
    o.ffmpeg,
    ...QUIET,
    "-init_hw_device",
    "d3d11va",
    ...(o.audioDevice ? ["-f", "dshow", "-i", `audio=${o.audioDevice}`] : []),
    "-filter_complex",
    `ddagrab=output_idx=${o.output}:framerate=${o.fps},hwdownload,format=bgra`,
    "-c:v",
    "h264_qsv",
    "-g",
    String(o.fps),
    ...(o.audioDevice ? ["-c:a", "aac"] : []),
    "-f",
    "segment",
    "-segment_time",
    String(o.segmentSeconds),
    "-reset_timestamps",
    "1",
    "-segment_list",
    win(o.dir, "segments.csv"),
    "-segment_list_type",
    "csv",
    win(o.dir, "seg-%05d.mkv"),
  ];
}

export interface ExtractOptions {
  ffmpeg: string;
  segment: string;
  /** Seconds into the segment to start. */
  offset: number;
  duration: number;
  fps: number;
  /** An ffmpeg number pattern, e.g. `C:\scratch\f-%04d.jpg`. */
  pattern: string;
}

export function extractArgv(o: ExtractOptions): string[] {
  return [
    o.ffmpeg,
    ...QUIET,
    "-ss",
    String(o.offset),
    "-i",
    o.segment,
    "-t",
    String(o.duration),
    "-vf",
    `fps=${o.fps}`,
    "-q:v",
    "2",
    o.pattern,
  ];
}

/** The concat demuxer's list format. Paths are relative to the list file's own folder. */
export function concatList(files: string[]): string {
  return files.map((file) => `file '${file}'\n`).join("");
}

export interface CutOptions {
  ffmpeg: string;
  list: string;
  offset: number;
  duration: number;
  out: string;
}

export function cutArgv(o: CutOptions): string[] {
  return [
    o.ffmpeg,
    ...QUIET,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    o.list,
    "-ss",
    String(o.offset),
    "-t",
    String(o.duration),
    "-c",
    "copy",
    o.out,
  ];
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/command.test.ts`
Expected: PASS, five tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/command.ts src/capture/command.test.ts
git commit -m "feat: build the ffmpeg commands capture runs"
```

---

### Task 6: Picking frames

Sixty frames come out of a `first` moment. At most five are worth keeping, and the choice is made
with the classifier the OCR already uses — no Tesseract, only pixel checks.

**Files:**
- Create: `src/capture/pick.ts`
- Test: `src/capture/pick.test.ts`

- [ ] **Step 1: Write the failing test**

The existing samples are the fixtures: `src/ocr/samples/toast.jpg` is a toast with a trophy,
`grid-15.jpg` a qualification board, `winner.jpg` the victory screen, `lobby.jpg` none of them.

```ts
// src/capture/pick.test.ts
import { expect, test } from "bun:test";
import { frameFrom } from "../ocr/frame";
import { pick } from "./pick";

const SAMPLES = "src/ocr/samples";
const candidate = (name: string, at: number) => ({ path: `${SAMPLES}/${name}`, at });

test("only frames showing the wanted screen are kept", async () => {
  const kept = await pick(
    [candidate("lobby.jpg", 1), candidate("toast.jpg", 2), candidate("grid-15.jpg", 3)],
    "toast",
    5,
    frameFrom,
  );
  expect(kept.map((frame) => frame.path)).toEqual([`${SAMPLES}/toast.jpg`]);
});

test("the earliest frames win when more pass than the limit", async () => {
  const kept = await pick(
    [candidate("grid-15.jpg", 30), candidate("grid-5.jpg", 10)],
    "grid",
    1,
    frameFrom,
  );
  expect(kept.map((frame) => frame.at)).toEqual([10]);
});

test("nothing passing yields nothing rather than a guess", async () => {
  expect(await pick([candidate("lobby.jpg", 1)], "winner", 5, frameFrom)).toEqual([]);
});

test("a frame that cannot be decoded is skipped, not fatal", async () => {
  const kept = await pick(
    [candidate("missing.jpg", 1), candidate("winner.jpg", 2)],
    "winner",
    5,
    frameFrom,
  );
  expect(kept.map((frame) => frame.at)).toEqual([2]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/pick.test.ts`
Expected: FAIL — cannot resolve `./pick`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/pick.ts
import { identify, type Screen } from "../ocr/recognizers";
import type { Frame } from "../ocr/frame";

export interface Candidate {
  path: string;
  /** Epoch ms the frame shows. */
  at: number;
}

export type Kept = Candidate;

/**
 * Which of a moment's frames are worth keeping, earliest first. `identify` is pixel work only — the
 * expensive read happens later, and only on what survives here.
 */
export async function pick(
  candidates: Candidate[],
  want: Screen,
  limit: number,
  frameOf: (path: string) => Promise<Frame>,
  screenOf: (frame: Frame) => Screen | undefined = identify,
): Promise<Kept[]> {
  const kept: Kept[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.at - b.at)) {
    if (kept.length >= limit) break;
    try {
      if (screenOf(await frameOf(candidate.path)) === want) kept.push(candidate);
    } catch {
      // A frame ffmpeg was still writing cannot be decoded. There are dozens more.
    }
  }
  return kept;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/pick.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/pick.ts src/capture/pick.test.ts
git commit -m "feat: keep only the frames showing the screen a moment wanted"
```

---

### Task 7: The ledger

What has been captured already, so a restart mid-event re-extracts nothing, and a moment whose
segment has not closed yet is retried instead of dropped.

**Files:**
- Create: `src/capture/ledger.ts`
- Test: `src/capture/ledger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/ledger.test.ts
import { expect, test } from "bun:test";
import { Ledger, MAX_ATTEMPTS } from "./ledger";

test("a fresh key is worth trying", () => {
  expect(new Ledger().pending("0:first:0")).toBe(true);
});

test("a key that succeeded is never tried again", () => {
  const ledger = new Ledger();
  ledger.done("0:first:0");
  expect(ledger.pending("0:first:0")).toBe(false);
});

test("a key is retried until it runs out of attempts", () => {
  const ledger = new Ledger();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    expect(ledger.pending("0:winner:-")).toBe(true);
    ledger.failed("0:winner:-");
  }
  expect(ledger.pending("0:winner:-")).toBe(false);
});

test("what a ledger knows survives being written out and read back", () => {
  const ledger = new Ledger();
  ledger.done("0:first:0");
  ledger.failed("0:first:1");
  const reloaded = new Ledger(JSON.parse(JSON.stringify(ledger.state())));
  expect(reloaded.pending("0:first:0")).toBe(false);
  expect(reloaded.pending("0:first:1")).toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/ledger.test.ts`
Expected: FAIL — cannot resolve `./ledger`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/ledger.ts

/**
 * A moment inside the segment still recording cannot be found yet, so failing is normal and
 * retrying is the point. Three attempts across three polls is well past the segment closing.
 */
export const MAX_ATTEMPTS = 3;

export interface LedgerState {
  captured: string[];
  attempts: Record<string, number>;
}

export class Ledger {
  private readonly captured: Set<string>;
  private readonly attempts: Map<string, number>;

  constructor(state?: LedgerState) {
    this.captured = new Set(state?.captured ?? []);
    this.attempts = new Map(Object.entries(state?.attempts ?? {}));
  }

  pending(key: string): boolean {
    return !this.captured.has(key) && (this.attempts.get(key) ?? 0) < MAX_ATTEMPTS;
  }

  done(key: string): void {
    this.captured.add(key);
    this.attempts.delete(key);
  }

  failed(key: string): void {
    this.attempts.set(key, (this.attempts.get(key) ?? 0) + 1);
  }

  state(): LedgerState {
    return {
      captured: [...this.captured],
      attempts: Object.fromEntries(this.attempts),
    };
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/ledger.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/ledger.ts src/capture/ledger.test.ts
git commit -m "feat: remember which moments have been captured"
```

---

### Task 8: One job at a time

Extraction decodes dozens of frames. The admin polls every few seconds and must never wait on it,
so the work queues in the background — the same shape as `ReadQueue`.

**Files:**
- Create: `src/capture/serial.ts`
- Test: `src/capture/serial.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/serial.test.ts
import { expect, test } from "bun:test";
import { Serial } from "./serial";

test("jobs run one at a time, in the order they were added", async () => {
  const order: string[] = [];
  let running = 0;
  const serial = new Serial();
  const job = (name: string) => async () => {
    running += 1;
    expect(running).toBe(1);
    await Bun.sleep(1);
    order.push(name);
    running -= 1;
  };
  serial.add(job("a"));
  serial.add(job("b"));
  await serial.drained();
  expect(order).toEqual(["a", "b"]);
});

test("a job that throws does not stop the next", async () => {
  const done: string[] = [];
  const serial = new Serial();
  serial.add(async () => {
    throw new Error("nope");
  });
  serial.add(async () => {
    done.push("after");
  });
  await serial.drained();
  expect(done).toEqual(["after"]);
});

test("adding to an idle queue starts it again", async () => {
  const serial = new Serial();
  let ran = 0;
  serial.add(async () => {
    ran += 1;
  });
  await serial.drained();
  serial.add(async () => {
    ran += 1;
  });
  await serial.drained();
  expect(ran).toBe(2);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/serial.test.ts`
Expected: FAIL — cannot resolve `./serial`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/serial.ts

/** Background work, one job at a time. The request that queued it never waits. */
export class Serial {
  private pending: (() => Promise<void>)[] = [];
  private running?: Promise<void>;

  add(job: () => Promise<void>): void {
    this.pending.push(job);
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
  }

  /** Resolves once nothing is left. Used by the tests; the server never waits. */
  async drained(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      try {
        await job();
      } catch (error) {
        console.error(`capture job failed — ${String(error)}`);
      }
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/serial.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/serial.ts src/capture/serial.test.ts
git commit -m "feat: run capture work one job at a time"
```

---

### Task 9: Two worlds, two path forms

Bun runs under WSL, so every path it touches is `/mnt/c/...` — that is what the whole codebase
already uses (`WINDOWS_USERS = "/mnt/c/Users"`). But `ffmpeg.exe` is a Windows process, and the
**file arguments** handed to it must be `C:\...` or it will not find them. The binary's own path
stays in WSL form: `Bun.spawn` launches `/mnt/c/Program Files/ShareX/ffmpeg.exe` fine.

So paths are held in WSL form everywhere and converted at the one boundary where argv is built.
Getting this wrong is silent: ffmpeg reports a missing input and the capture just never appears.

**Files:**
- Create: `src/capture/win-path.ts`
- Test: `src/capture/win-path.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/win-path.test.ts
import { expect, test } from "bun:test";
import { toWindows } from "./win-path";

test("a WSL mount becomes a drive letter with backslashes", () => {
  expect(toWindows("/mnt/c/FallGuysCapture/segments")).toBe("C:\\FallGuysCapture\\segments");
});

test("the drive letter is capitalised", () => {
  expect(toWindows("/mnt/d/caps")).toBe("D:\\caps");
});

test("a mount root becomes the drive root", () => {
  expect(toWindows("/mnt/c")).toBe("C:\\");
});

test("a path that is already a Windows path is left alone", () => {
  expect(toWindows("C:\\FallGuysCapture")).toBe("C:\\FallGuysCapture");
});

test("a path on no drive is left alone rather than mangled", () => {
  expect(toWindows("/home/wouter/scratch")).toBe("/home/wouter/scratch");
});

test("an ffmpeg number pattern survives the conversion", () => {
  expect(toWindows("/mnt/c/x/scratch/p0-%04d.jpg")).toBe("C:\\x\\scratch\\p0-%04d.jpg");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/win-path.test.ts`
Expected: FAIL — cannot resolve `./win-path`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/win-path.ts

const MOUNT = /^\/mnt\/([a-z])(\/.*)?$/i;

/**
 * The path form `ffmpeg.exe` understands. Everything Bun touches stays in WSL form; only the file
 * arguments handed to a Windows process go through here. A path that is not a WSL mount is returned
 * unchanged, so an already-Windows path passes through.
 */
export function toWindows(path: string): string {
  const mount = MOUNT.exec(path);
  if (!mount) return path;
  const drive = mount[1]!.toUpperCase();
  const rest = (mount[2] ?? "").replace(/\//g, "\\");
  return `${drive}:${rest || "\\"}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/win-path.test.ts`
Expected: PASS, six tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/win-path.ts src/capture/win-path.test.ts
git commit -m "feat: hand ffmpeg the path form Windows understands"
```

---

### Task 10: Paths and settings

Where ffmpeg is, where recordings go, and which monitor to grab. Follows the pattern in
`src/windows-path.ts`: an env var wins, otherwise a known location, otherwise nothing. Everything
here is in **WSL form**; `toWindows` is applied where argv is built, not here.

**Files:**
- Create: `src/capture/paths.ts`
- Test: `src/capture/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/paths.test.ts
import { expect, test } from "bun:test";
import { captureFolders, captureSettings, FFMPEG_DEFAULT } from "./paths";

const exists = (paths: string[]) => async (path: string) => paths.includes(path);

test("ShareX's bundled ffmpeg is used when nothing says otherwise", async () => {
  const settings = await captureSettings({}, exists([FFMPEG_DEFAULT]));
  expect(settings.ffmpeg).toBe(FFMPEG_DEFAULT);
});

test("FFMPEG_PATH wins over the bundled one", async () => {
  const settings = await captureSettings(
    { FFMPEG_PATH: "/mnt/d/tools/ffmpeg.exe" },
    exists([FFMPEG_DEFAULT, "/mnt/d/tools/ffmpeg.exe"]),
  );
  expect(settings.ffmpeg).toBe("/mnt/d/tools/ffmpeg.exe");
});

test("no ffmpeg anywhere is reported rather than guessed at", async () => {
  const settings = await captureSettings({}, exists([]));
  expect(settings.ffmpeg).toBeUndefined();
});

test("the capture folder, monitor and audio device come from the environment", async () => {
  const settings = await captureSettings(
    { CAPTURE_DIR: "/mnt/d/caps", CAPTURE_OUTPUT: "1", CAPTURE_AUDIO: "loop-thing" },
    exists([FFMPEG_DEFAULT]),
  );
  expect(settings.dir).toBe("/mnt/d/caps");
  expect(settings.output).toBe(1);
  expect(settings.audioDevice).toBe("loop-thing");
});

test("defaults are the first monitor, /mnt/c/FallGuysCapture and the usual loopback device", async () => {
  const settings = await captureSettings({}, exists([FFMPEG_DEFAULT]));
  expect(settings.dir).toBe("/mnt/c/FallGuysCapture");
  expect(settings.output).toBe(0);
  expect(settings.audioDevice).toBe("virtual-audio-capturer");
});

test("the folders under the capture dir stay in WSL form", async () => {
  expect(captureFolders("/mnt/c/FallGuysCapture").segments).toBe(
    "/mnt/c/FallGuysCapture/segments",
  );
});

test("CAPTURE_AUDIO=off records silently", async () => {
  const settings = await captureSettings({ CAPTURE_AUDIO: "off" }, exists([FFMPEG_DEFAULT]));
  expect(settings.audioDevice).toBeUndefined();
});

test("a CAPTURE_OUTPUT that is not a number falls back to the first monitor", async () => {
  const settings = await captureSettings({ CAPTURE_OUTPUT: "left" }, exists([FFMPEG_DEFAULT]));
  expect(settings.output).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/paths.test.ts`
Expected: FAIL — cannot resolve `./paths`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/paths.ts

/** ShareX ships the ffmpeg the screen recorder uses, so there is nothing to install. */
export const FFMPEG_DEFAULT = "/mnt/c/Program Files/ShareX/ffmpeg.exe";
/** Not the repo: it is inside Dropbox, and this is tens of gigabytes. */
export const CAPTURE_DIR_DEFAULT = "/mnt/c/FallGuysCapture";
/** What the screen-capture-recorder installer registers. Taps the default output, changing nothing. */
export const AUDIO_DEFAULT = "virtual-audio-capturer";

export interface CaptureSettings {
  /** Absent when no ffmpeg was found, which is the only fatal one. */
  ffmpeg?: string;
  dir: string;
  output: number;
  /** Absent means record silently. */
  audioDevice?: string;
}

export type Exists = (path: string) => Promise<boolean>;

const fileExists: Exists = (path) => Bun.file(path).exists();

export async function captureSettings(
  env: Record<string, string | undefined>,
  exists: Exists = fileExists,
): Promise<CaptureSettings> {
  const wanted = [env.FFMPEG_PATH, FFMPEG_DEFAULT].filter((path): path is string => !!path);
  let ffmpeg: string | undefined;
  for (const path of wanted) {
    if (await exists(path)) {
      ffmpeg = path;
      break;
    }
  }

  const output = Number(env.CAPTURE_OUTPUT);
  const audio = env.CAPTURE_AUDIO ?? AUDIO_DEFAULT;

  return {
    ...(ffmpeg === undefined ? {} : { ffmpeg }),
    dir: env.CAPTURE_DIR ?? CAPTURE_DIR_DEFAULT,
    output: Number.isInteger(output) ? output : 0,
    ...(audio === "off" ? {} : { audioDevice: audio }),
  };
}

/** The four folders under the capture dir, so nothing has to spell them out twice. */
export function captureFolders(dir: string) {
  const at = (name: string) => `${dir.replace(/\/+$/, "")}/${name}`;
  return {
    segments: at("segments"),
    shows: at("shows"),
    scratch: at("scratch"),
    captures: at("captures"),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/paths.test.ts`
Expected: PASS, seven tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/paths.ts src/capture/paths.test.ts
git commit -m "feat: settle where ffmpeg, recordings and captures live"
```

---

### Task 11: The recorder

Spawns the long ffmpeg, falls back to video-only if the audio device will not open, restarts it if
it dies, and says which of those is true.

**Files:**
- Create: `src/capture/recorder.ts`
- Test: `src/capture/recorder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/recorder.test.ts
import { expect, test } from "bun:test";
import { Recorder, type Spawned } from "./recorder";

function fakeSpawn(exits: number[]) {
  const calls: string[][] = [];
  let next = 0;
  const spawn = (argv: string[]): Spawned => {
    calls.push(argv);
    const code = exits[next++] ?? 0;
    return {
      exited: code === -1 ? new Promise<number>(() => {}) : Promise.resolve(code),
      kill() {},
    };
  };
  return { spawn, calls };
}

const argvFor = (audio: boolean) => (audio ? ["ff", "-i", "audio"] : ["ff", "silent"]);

test("recording starts with audio and reports itself running", async () => {
  const { spawn, calls } = fakeSpawn([-1]);
  const recorder = new Recorder({ argvFor, spawn, now: () => 1000 });
  recorder.start();
  await Bun.sleep(5);
  expect(calls).toEqual([["ff", "-i", "audio"]]);
  expect(recorder.status()).toEqual({ running: true, audio: true, since: 1000 });
});

test("an audio device that will not open falls back to video only rather than to nothing", async () => {
  const { spawn, calls } = fakeSpawn([1, -1]);
  const recorder = new Recorder({ argvFor, spawn, now: () => 2000 });
  recorder.start();
  await Bun.sleep(20);
  expect(calls).toEqual([
    ["ff", "-i", "audio"],
    ["ff", "silent"],
  ]);
  expect(recorder.status()).toEqual({ running: true, audio: false, since: 2000 });
});

test("a recorder that has been stopped does not restart itself", async () => {
  const { spawn, calls } = fakeSpawn([1, 1, -1]);
  const recorder = new Recorder({ argvFor, spawn, now: () => 0, retryMs: 1 });
  recorder.start();
  await Bun.sleep(5);
  recorder.stop();
  const seen = calls.length;
  await Bun.sleep(20);
  expect(calls.length).toBe(seen);
  expect(recorder.status().running).toBe(false);
});

test("a recording that dies is retried, and the failure is on the status", async () => {
  const { spawn } = fakeSpawn([1, 1, 1, 1]);
  const recorder = new Recorder({ argvFor, spawn, now: () => 0, retryMs: 1 });
  recorder.start();
  await Bun.sleep(20);
  const status = recorder.status();
  expect(status.running).toBe(false);
  expect(status.error).toContain("exit 1");
  recorder.stop();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/recorder.test.ts`
Expected: FAIL — cannot resolve `./recorder`.

- [ ] **Step 3: Write the module**

```ts
// src/capture/recorder.ts

export interface Spawned {
  exited: Promise<number>;
  kill(): void;
}

export interface RecorderStatus {
  running: boolean;
  /** Whether the recording that is running has sound. */
  audio: boolean;
  /** Wall clock the recording started, which is what segment times are measured from. */
  since?: number;
  error?: string;
}

export interface RecorderOptions {
  argvFor: (audio: boolean) => string[];
  spawn: (argv: string[]) => Spawned;
  now: () => number;
  /** How long to wait before starting a recording again after one died. */
  retryMs?: number;
}

/** How soon after starting an exit counts as "that input would not open" rather than a crash. */
const IMMEDIATE_MS = 3000;

export class Recorder {
  private process?: Spawned;
  private stopped = true;
  private audio = true;
  private since?: number;
  private error?: string;
  private readonly retryMs: number;

  constructor(private readonly options: RecorderOptions) {
    this.retryMs = options.retryMs ?? 10_000;
  }

  /** When the running recording began. Segment times are relative to this. */
  startedAt(): number | undefined {
    return this.since;
  }

  status(): RecorderStatus {
    return {
      running: this.process !== undefined,
      audio: this.audio,
      ...(this.since === undefined ? {} : { since: this.since }),
      ...(this.error === undefined ? {} : { error: this.error }),
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.audio = true;
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.process?.kill();
    this.process = undefined;
    this.since = undefined;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const startedAt = this.options.now();
      const process = this.options.spawn(this.options.argvFor(this.audio));
      this.process = process;
      this.since = startedAt;
      this.error = undefined;

      const code = await process.exited;
      if (this.stopped) return;

      this.process = undefined;
      this.since = undefined;
      this.error = `ffmpeg exit ${code}`;

      // An input that will not open fails at once. Sound is worth having, but never at the cost of
      // recording nothing, so the next attempt drops it.
      if (this.audio && this.options.now() - startedAt < IMMEDIATE_MS) {
        this.audio = false;
        continue;
      }

      await Bun.sleep(this.retryMs);
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/recorder.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/recorder.ts src/capture/recorder.test.ts
git commit -m "feat: supervise the recording, and drop sound before dropping video"
```

---

### Task 12: A second shots root

Extracted frames must not be written into ShareX's folder — the README promises it is only ever
read. So a shot knows which root it came from.

**Files:**
- Modify: `src/screenshots.ts:3-9` (`Shot`), `src/shot-folder.ts:8-26` (`listShots`)
- Test: `src/shot-folder.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/shot-folder.test.ts`:

```ts
test("a listing says which root it came from", async () => {
  const dir = `${import.meta.dir}/../.test-shots`;
  await mkdir(`${dir}/2026-09`, { recursive: true });
  await Bun.write(`${dir}/2026-09/auto-1-first-200140-1.jpg`, "x");
  try {
    const [shot] = await listShots(dir, "2026-09", "auto");
    expect(shot!.source).toBe("auto");
    expect(shot!.file).toBe("2026-09/auto-1-first-200140-1.jpg");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a listing with no source given is ShareX's, as it always was", async () => {
  const dir = `${import.meta.dir}/../.test-shots-2`;
  await mkdir(`${dir}/2026-09`, { recursive: true });
  await Bun.write(`${dir}/2026-09/shot.jpg`, "x");
  try {
    const [shot] = await listShots(dir, "2026-09");
    expect(shot!.source).toBe("sharex");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

Add to that file's imports if they are not already there:

```ts
import { mkdir, rm } from "node:fs/promises";
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/shot-folder.test.ts`
Expected: FAIL — `listShots` takes two arguments, and `source` is not on `Shot`.

- [ ] **Step 3: Put the source on a shot**

In `src/screenshots.ts`, above `interface Shot`:

```ts
/** Which folder a capture came out of: ShareX's, or the frames cut from the recording. */
export type ShotSource = "sharex" | "auto";
```

and inside `interface Shot`:

```ts
  source: ShotSource;
```

- [ ] **Step 4: Have the listing say so**

In `src/shot-folder.ts`, change the signature and the push:

```ts
export async function listShots(
  root: string,
  month: string,
  source: ShotSource = "sharex",
): Promise<Shot[]> {
```

```ts
    if (info.isFile()) shots.push({ file: `${month}/${name}`, takenAt: info.mtimeMs, source });
```

and extend the import:

```ts
import type { Shot, ShotSource } from "./screenshots";
```

- [ ] **Step 5: Fix what no longer typechecks**

Run: `bun run typecheck`
Expected: errors in `src/screenshots.test.ts` and `site/admin-model.test.ts` wherever a `Shot` is
built by hand. Add `source: "sharex"` to each such literal. Do not change any assertion.

- [ ] **Step 6: Run everything**

Run: `bun test && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/screenshots.ts src/shot-folder.ts src/screenshots.test.ts src/shot-folder.test.ts site/admin-model.test.ts
git commit -m "feat: tell a capture's folder from the shot itself"
```

---

### Task 13: The pipeline

Wires it together: pending moments in, frames on disk with the right mtime out, and show clips cut.

**Files:**
- Create: `src/capture/pipeline.ts`
- Test: `src/capture/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/capture/pipeline.test.ts
import { expect, test } from "bun:test";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { Ledger } from "./ledger";
import { captureMoment } from "./pipeline";
import type { Moment } from "./moments";

const AT = Date.parse("2026-09-05T20:01:40Z");
const MOMENT: Moment = {
  kind: "first",
  showIndex: 0,
  roundIndex: 2,
  at: AT,
  from: AT - 500,
  to: AT + 1500,
  fps: 30,
};

const SEGMENTS = [
  { file: "seg-00003.mkv", from: AT - 20_000, to: AT + 10_000 },
];

function harness(dir: string) {
  const ran: string[][] = [];
  const scratchDir = `${dir}/scratch`;
  return {
    ran,
    deps: {
      ffmpeg: "ff",
      segmentDir: `${dir}/segments`,
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
      frameOf: async () => ({ width: 2, height: 2, at: () => [0, 0, 0] as const }),
      screenOf: () => "toast" as const,
    },
  };
}

test("a moment nothing covers is left pending rather than half captured", async () => {
  const dir = `${import.meta.dir}/../../.test-pipeline-1`;
  const { deps, ran } = harness(dir);
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, [], ledger, deps);
    expect(kept).toEqual([]);
    expect(ran).toEqual([]);
    expect(ledger.pending("0:first:2")).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("kept frames land in the capture root with the mtime of the instant they show", async () => {
  const dir = `${import.meta.dir}/../../.test-pipeline-2`;
  const { deps, ran } = harness(dir);
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SEGMENTS, ledger, deps);
    expect(ran.length).toBe(1);
    expect(ran[0]![0]).toBe("ff");
    expect(kept.length).toBeGreaterThan(0);
    const first = kept[0]!;
    expect(first).toContain("2026-09/auto-1-first-");
    const info = await stat(`${dir}/captures/${first}`);
    // Frame 1 of a 30fps pull that began at `from`.
    expect(Math.round(info.mtimeMs)).toBe(MOMENT.from);
    expect(ledger.pending("0:first:2")).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a moment whose frames all fail the classifier is counted as an attempt, not a success", async () => {
  const dir = `${import.meta.dir}/../../.test-pipeline-3`;
  const { deps } = harness(dir);
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(
      MOMENT,
      SEGMENTS,
      ledger,
      { ...deps, screenOf: () => undefined },
    );
    expect(kept).toEqual([]);
    expect(ledger.pending("0:first:2")).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/pipeline.test.ts`
Expected: FAIL — cannot resolve `./pipeline`.

- [ ] **Step 3: Write the module**

`screenOf` is injected so the test can stand in for `identify` without building real pixels; the
server passes `identify` itself.

```ts
// src/capture/pipeline.ts
import { mkdir, readdir, rm, utimes } from "node:fs/promises";
import { concatList, cutArgv, extractArgv } from "./command";
import { clipKey, momentKey, type Moment, type MomentKind, type ShowClip } from "./moments";
import { pick } from "./pick";
import { coverage, offsetIn, type Segment } from "./segments";
import { toWindows } from "./win-path";
import type { Ledger } from "./ledger";
import type { Frame } from "../ocr/frame";
import type { Screen } from "../ocr/recognizers";

/** Which screen each moment is hunting for. */
const WANTED: Record<MomentKind, Screen> = {
  first: "toast",
  finalists: "grid",
  winner: "winner",
};

/** More than this and the capture panel is a wall of near-identical frames. */
const KEEP = 5;

export interface RunResult {
  ok: boolean;
  stderr: string;
}

export interface CaptureDeps {
  ffmpeg: string;
  segmentDir: string;
  scratchDir: string;
  captureDir: string;
  run: (argv: string[]) => Promise<RunResult>;
  frameOf: (path: string) => Promise<Frame>;
  screenOf: (frame: Frame) => Screen | undefined;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** `YYYY-MM`, the month folder both shots roots are laid out by. */
function monthOf(at: number): string {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1, 2)}`;
}

/** `HHMMSS` of the instant, so a frame's name says when it is from. */
function clockOf(at: number): string {
  const date = new Date(at);
  return `${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}`;
}

/**
 * Pulls one moment's frames, keeps the few showing the screen it wanted, and files them under the
 * mtime of the instant each shows — which is what lets `placeShots` treat them as captures.
 *
 * Returns the paths kept, relative to the capture root. An empty return leaves the moment pending:
 * the segment holding it may simply not have closed yet.
 */
export async function captureMoment(
  moment: Moment,
  segments: Segment[],
  ledger: Ledger,
  deps: CaptureDeps,
): Promise<string[]> {
  const key = momentKey(moment);
  const { parts, complete } = coverage(segments, moment.from, moment.to);
  if (!complete) {
    ledger.failed(key);
    return [];
  }

  const scratch = `${deps.scratchDir}/${key.replace(/:/g, "-")}`;
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });

  try {
    const candidates: { path: string; at: number }[] = [];

    for (const [index, part] of parts.entries()) {
      const from = Math.max(moment.from, part.from);
      const to = Math.min(moment.to, part.to);
      const pattern = `${scratch}/p${index}-%04d.jpg`;
      const result = await deps.run(
        extractArgv({
          ffmpeg: deps.ffmpeg,
          segment: toWindows(`${deps.segmentDir}/${part.file}`),
          offset: offsetIn(part, from),
          duration: (to - from) / 1000,
          fps: moment.fps,
          pattern: toWindows(pattern),
        }),
      );
      if (!result.ok) continue;

      const names = (await readdir(scratch)).filter((name) => name.startsWith(`p${index}-`)).sort();
      names.forEach((name, frame) => {
        // ffmpeg numbers from 1, and each frame is one tick of the requested rate past the seek.
        candidates.push({ path: `${scratch}/${name}`, at: from + (frame * 1000) / moment.fps });
      });
    }

    const kept: string[] = [];
    const chosen = await pick(
      candidates,
      WANTED[moment.kind],
      KEEP,
      deps.frameOf,
      deps.screenOf,
    );

    for (const candidate of chosen) {
      const month = monthOf(candidate.at);
      const name = `auto-${moment.showIndex + 1}-${moment.kind}-${clockOf(candidate.at)}-${kept.length + 1}.jpg`;
      const relative = `${month}/${name}`;
      await mkdir(`${deps.captureDir}/${month}`, { recursive: true });
      await Bun.write(`${deps.captureDir}/${relative}`, Bun.file(candidate.path));
      const seconds = candidate.at / 1000;
      await utimes(`${deps.captureDir}/${relative}`, seconds, seconds);
      kept.push(relative);
    }

    if (kept.length === 0) ledger.failed(key);
    else ledger.done(key);
    return kept;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export interface ClipDeps {
  ffmpeg: string;
  segmentDir: string;
  showsDir: string;
  run: (argv: string[]) => Promise<RunResult>;
}

/**
 * Cuts one show's mp4 out of the segments it spans. `-c copy`, so this is a file operation rather
 * than an encode; `-g` on the recording is what keeps the cut within about a second of `from`.
 */
export async function cutShowClip(
  clip: ShowClip,
  segments: Segment[],
  name: string,
  ledger: Ledger,
  deps: ClipDeps,
): Promise<string | undefined> {
  const key = clipKey(clip);
  const { parts, complete } = coverage(segments, clip.from, clip.to);
  if (!complete) {
    ledger.failed(key);
    return undefined;
  }

  const list = `${deps.segmentDir}/clip-${clip.showIndex}.txt`;
  await Bun.write(list, concatList(parts.map((part) => part.file)));
  await mkdir(deps.showsDir, { recursive: true });

  const out = `${deps.showsDir}/${name}.mp4`;
  const result = await deps.run(
    cutArgv({
      ffmpeg: deps.ffmpeg,
      list: toWindows(list),
      offset: offsetIn(parts[0]!, clip.from),
      duration: (clip.to - clip.from) / 1000,
      out: toWindows(out),
    }),
  );

  if (!result.ok) {
    ledger.failed(key);
    return undefined;
  }
  ledger.done(key);
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/pipeline.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add src/capture/pipeline.ts src/capture/pipeline.test.ts
git commit -m "feat: cut a moment's frames out of the recording"
```

---

### Task 14: Wire it into the server

**Files:**
- Modify: `scripts/serve.ts`
- Test: none — this is wiring. Everything it calls is already covered.

- [ ] **Step 1: Add the imports and the flag**

At the top of `scripts/serve.ts`, after the existing imports:

```ts
import { mkdir } from "node:fs/promises";
import { momentsIn, momentKey, showClips, clipKey } from "../src/capture/moments";
import { parseSegments } from "../src/capture/segments";
import { recordArgv } from "../src/capture/command";
import { captureSettings, captureFolders } from "../src/capture/paths";
import { toWindows } from "../src/capture/win-path";
import { Recorder } from "../src/capture/recorder";
import { Ledger, type LedgerState } from "../src/capture/ledger";
import { Serial } from "../src/capture/serial";
import { captureMoment, cutShowClip } from "../src/capture/pipeline";
import { identify } from "../src/ocr/recognizers";
import { frameFrom } from "../src/ocr/frame";
```

Next to `AUTO_PUBLISH`:

```ts
/**
 * Off by default: recording eats tens of gigabytes and only the event needs it. `bun run live`
 * turns it on.
 */
const RECORD = Bun.argv.includes("--record");
const LEDGER_PATH = ".ocr-cache/captured.json";
```

- [ ] **Step 2: Start the recorder**

After the `reader` setup (around `scripts/serve.ts:70`):

```ts
const capture = await captureSettings(process.env);
const folders = captureFolders(capture.dir);
const ledger = new Ledger(
  await Bun.file(LEDGER_PATH)
    .json()
    .then((state) => state as LedgerState)
    .catch(() => undefined),
);
const captureJobs = new Serial();

const recorder = new Recorder({
  argvFor: (audio) =>
    recordArgv({
      ffmpeg: capture.ffmpeg!,
      output: capture.output,
      ...(audio && capture.audioDevice ? { audioDevice: capture.audioDevice } : {}),
      dir: toWindows(folders.segments),
      fps: 30,
      segmentSeconds: 30,
    }),
  spawn: (argv) => {
    const child = Bun.spawn(argv, { stdout: "ignore", stderr: "pipe" });
    return { exited: child.exited, kill: () => child.kill() };
  },
  now: () => Date.now(),
});

if (RECORD) {
  if (!capture.ffmpeg) {
    console.error(`Recording  off — no ffmpeg found. Set FFMPEG_PATH.`);
  } else {
    for (const dir of Object.values(folders)) await mkdir(dir, { recursive: true });
    recorder.start();
  }
}
```

- [ ] **Step 3: Add the poll that captures moments**

Below that:

```ts
async function segmentsNow() {
  const startedAt = recorder.startedAt();
  if (startedAt === undefined) return [];
  const csv = await Bun.file(`${folders.segments}/segments.csv`)
    .text()
    .catch(() => "");
  return parseSegments(csv, startedAt);
}

/**
 * Frames are found by the clock stamp inside a log line, never by when the line was noticed, so a
 * log that flushed late still names the right frame.
 */
async function sweepCaptures(): Promise<void> {
  const shows = await parsedShows(await findLog());
  if (shows.length === 0) return;
  const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
  const segments = await segmentsNow();
  if (segments.length === 0) return;

  for (const moment of momentsIn(shows, event.date)) {
    if (!ledger.pending(momentKey(moment))) continue;
    captureJobs.add(async () => {
      await captureMoment(moment, segments, ledger, {
        ffmpeg: capture.ffmpeg!,
        segmentDir: folders.segments,
        scratchDir: folders.scratch,
        captureDir: folders.captures,
        run: runFfmpeg,
        frameOf: frameFrom,
        screenOf: identify,
      });
    });
  }

  for (const clip of showClips(shows, event.date)) {
    if (!ledger.pending(clipKey(clip))) continue;
    const name = `show-${String(clip.showIndex + 1).padStart(2, "0")}-${suggestShowName(shows, clip.showIndex)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    captureJobs.add(async () => {
      await cutShowClip(clip, segments, name, ledger, {
        ffmpeg: capture.ffmpeg!,
        segmentDir: folders.segments,
        showsDir: folders.shows,
        run: runFfmpeg,
      });
    });
  }
}

async function runFfmpeg(argv: string[]) {
  const child = Bun.spawn(argv, { stdout: "ignore", stderr: "pipe" });
  const stderr = await new Response(child.stderr).text();
  return { ok: (await child.exited) === 0, stderr };
}

if (RECORD && capture.ffmpeg) {
  setInterval(() => void sweepCaptures().catch(() => {}), 5_000);
  setInterval(
    () => void Bun.write(LEDGER_PATH, `${JSON.stringify(ledger.state(), null, 2)}\n`),
    10_000,
  );
}
```

- [ ] **Step 4: List both shots roots**

Change `placed` so it reads the capture root too:

```ts
/** Screenshots are a reading aid: a missing or unreadable folder must not stop the admin loading. */
async function placed(dir: string | undefined, shows: ParsedShow[], date: string) {
  const month = date.slice(0, 7);
  const shots: Shot[] = [];
  for (const [root, source] of [
    [dir, "sharex"],
    [RECORD ? folders.captures : undefined, "auto"],
  ] as const) {
    if (!root) continue;
    try {
      shots.push(...(await listShots(root, month, source)));
    } catch {
      // One unreadable root must not cost the other.
    }
  }
  try {
    return placeShots(shots, shows, date);
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Resolve a shot against the root its source names**

Replace the `/api/shot` handler body:

```ts
    if (pathname === "/api/shot") {
      const params = new URL(request.url).searchParams;
      const file = params.get("f");
      const source = params.get("s") === "auto" ? folders.captures : await findScreenshotDir();
      if (!source || !file) return new Response("Not found", { status: 404 });
      const path = resolveShot(source, file);
      if (!path) return new Response("Forbidden", { status: 403 });
      const image = Bun.file(path);
      if (!(await image.exists())) return new Response("Not found", { status: 404 });
      return new Response(image);
    }
```

- [ ] **Step 6: Put the recorder on the state**

In the `/api/state` response object, after `autoPublish`:

```ts
        capture: RECORD ? recorder.status() : null,
```

- [ ] **Step 7: Say what is on at startup**

At the bottom, after the `Publishing` line:

```ts
console.log(
  `Recording     ${RECORD ? (capture.ffmpeg ? `on — ${folders.segments}` : "off — no ffmpeg found") : "off"}`,
);
```

- [ ] **Step 8: Pass `--record` from `bun run live`**

In `package.json`:

```json
    "live": "bun run scripts/serve.ts --publish --record",
```

- [ ] **Step 9: Check it starts**

Run: `bun run typecheck && bun test`
Expected: PASS.

Run: `bun run dev` and confirm the console says `Recording     off`, then stop it.
Run: `bun run live` and confirm it says `Recording     on — /mnt/c/FallGuysCapture/segments`, that
`segments.csv` appears within a minute, then stop it.

- [ ] **Step 10: Commit**

```bash
git add scripts/serve.ts package.json
git commit -m "feat: record the screen and cut captures out of it while the event runs"
```

---

### Task 15: The recorder badge

Silent death is the failure that costs the most, so liveness goes on screen.

**Files:**
- Modify: `site/admin.html:22`, `site/admin.ts:33-40` (the state type), `site/admin.ts:264-300` (the
  shot URL), `site/admin.ts:617-623` (the badges)

- [ ] **Step 1: Add the badge to the markup**

In `site/admin.html`, replace line 22:

```html
      <h1>Admin <span id="publish-badge" class="badge"></span> <span id="capture-badge" class="badge"></span></h1>
```

- [ ] **Step 2: Add it to the state type**

In `site/admin.ts`, inside the state interface next to `autoPublish`:

```ts
  /** Null when the server is not recording. */
  capture: { running: boolean; audio: boolean; since?: number; error?: string } | null;
```

- [ ] **Step 3: Send the source with the shot request**

In `site/admin.ts`, in `shotImages`, change the image src:

```ts
      src: `/api/shot?f=${encodeURIComponent(shot.file)}&s=${shot.source}`,
```

- [ ] **Step 4: Render the badge**

Next to where `#publish-badge` is set:

```ts
  const capture = document.querySelector<HTMLElement>("#capture-badge")!;
  const status = state.capture;
  capture.hidden = status === null;
  if (status) {
    capture.textContent = status.running
      ? status.audio
        ? "recording"
        : "recording — no sound"
      : "NOT RECORDING";
    capture.className = status.running ? "badge on" : "badge off";
    capture.title = status.error ?? "";
  }
```

- [ ] **Step 5: Check it renders**

Run: `bun run live`, open <http://localhost:3000/admin>, and confirm the header shows a green
`recording` badge. Kill the ffmpeg process from Task Manager and confirm the badge turns to
`NOT RECORDING` within a poll, then comes back on its own.

- [ ] **Step 6: Commit**

```bash
git add site/admin.html site/admin.ts
git commit -m "feat: show on the admin whether the screen is being recorded"
```

---

### Task 16: Document it

**Files:**
- Modify: `README.md` (the `## Screenshots` section and after it)

- [ ] **Step 1: Write the section**

After the `## Reading names off the captures` section in `README.md`, add:

````markdown
## Capturing the screens automatically

`bun run live` records the screen for the whole event and cuts the frames the reader needs out of
the recording afterwards, so nothing has to be shot by hand. The screen that names who finished
first can be gone in a fraction of a second, and no capture that reacts to an event can catch it.

Frames are found by the clock stamp **inside** the log line, never by when the line arrived, so a
log that flushed late still names the right frame.

```bash
CAPTURE_OUTPUT=1 bun run live
```

| Setting          | Default                                  | What it is                                          |
|------------------|------------------------------------------|-----------------------------------------------------|
| `CAPTURE_OUTPUT` | `0`                                      | Which monitor to record, numbered from 0            |
| `CAPTURE_DIR`    | `/mnt/c/FallGuysCapture`                 | Where segments, clips and frames go                 |
| `CAPTURE_AUDIO`  | `virtual-audio-capturer`                 | dshow device to record sound from; `off` for silent  |
| `FFMPEG_PATH`    | `/mnt/c/Program Files/ShareX/ffmpeg.exe` | ShareX ships the one this uses                      |

The header carries a **recording** badge. If it reads `NOT RECORDING`, nothing is being captured
and the manual `Alt + Print Screen` is the only thing still working.

One mp4 per show lands in `CAPTURE_DIR/shows`, cut from the first round to just past the victory
screen without re-encoding.

Recordings are not committed, not copied into the repo, and not cleaned up — `CAPTURE_DIR` is
yours to empty. Roughly 20GB for a four-hour event.

### Before the event

1. Install `virtual-audio-capturer` (from the screen-capture-recorder installer) and confirm
   ffmpeg lists it:
   ```bash
   "/mnt/c/Program Files/ShareX/ffmpeg.exe" -list_devices true -f dshow -i dummy
   ```
   Without it the recording still happens, silently, and the badge says so.
2. Find the monitor Fall Guys is on and set `CAPTURE_OUTPUT`. Record ten seconds and watch it back.
3. Play one round and confirm a frame with a trophy pill turns up in the capture panel.
4. Leave 30GB free on `CAPTURE_DIR`'s drive.

This machine has no NVENC or AMF encoder, so the recording uses Quick Sync (`h264_qsv`).
````

- [ ] **Step 2: Note that ShareX is now the backup**

In the existing `## Screenshots` section, after the first paragraph, add:

```markdown
Shooting by hand is the backup now — see [Capturing the screens
automatically](#capturing-the-screens-automatically). It still works exactly as described here, and
a hand-shot capture and a cut frame are treated identically.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe recording the screen and cutting captures from it"
```

---

### Task 17: Verify and merge

- [ ] **Step 1: Full check**

Run: `bun test && bun run typecheck`
Expected: PASS, zero warnings.

- [ ] **Step 2: Confirm nothing stray is in the diff**

Run: `git status --short && git diff main --stat`
Expected: only the files this plan names. No `.test-*` folders, no recordings.

- [ ] **Step 3: Hand back for the manual run**

The pre-event checklist in Task 16 needs a live game and cannot be done here. Report it as
outstanding rather than claiming the feature is verified end to end.

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff <branch>
```

Ask before pushing.
