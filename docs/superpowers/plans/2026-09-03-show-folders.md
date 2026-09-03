# Captures grouped by show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every show's video, transcript and captures in one folder named after the show, with captures named `round-01-first-race-finisher-01.jpg`.

**Architecture:** A new pure module `src/capture/layout.ts` owns every name and every window in the capture tree. `pipeline.ts` writes into the folder it is handed, `shot-folder.ts` lists those folders back, and `scripts/serve.ts` is the only thing that wires them together. Placement in the admin does not change: a capture is still placed by its mtime.

**Tech Stack:** Bun, TypeScript, `bun test`. Run everything with `bun`, never `npm`/`npx`.

**Spec:** [2026-09-03-show-folders-design.md](../specs/2026-09-03-show-folders-design.md)

---

## File Structure

| File | Responsibility |
|---------------------------------|-----------------------------------------------------------------|
| `src/capture/layout.ts` (new)   | Every name and window in the capture tree: show folder, capture file, clip file, which folders are tonight's |
| `src/capture/layout.test.ts` (new) | Its tests                                                     |
| `src/transcript/slice.ts` (new) | `linesBetween` — the lines of one show                          |
| `src/transcript/slice.test.ts` (new) | Its tests                                                  |
| `src/capture/moments.ts`        | Gains `roundNumber` on `Moment`                                 |
| `src/capture/pipeline.ts`       | Writes frames and clips into a show folder                      |
| `src/capture/paths.ts`          | `captureFolders` loses `captures`                               |
| `src/transcript/transcript.ts`  | Evening transcript at the capture root; `Transcript` gains a tap |
| `src/shot-folder.ts`            | Gains `listShowShots`                                           |
| `scripts/serve.ts`              | Wiring: show folders, per-show transcripts, auto shot root      |
| `README.md`, `docs/transcript.md` | The layout as documented                                      |

---

### Task 1: The kind vocabulary and the capture file name

**Files:**
- Create: `src/capture/layout.ts`
- Test: `src/capture/layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/capture/layout.test.ts`:

```ts
// Folder names are built from the local clock, so these must not run in UTC.
process.env.TZ = "Europe/Brussels";

import { expect, test } from "bun:test";
import { captureFile } from "./layout";

test("a capture is named for its round and what it shows", () => {
  expect(captureFile("first", 1, 1)).toBe("round-01-first-race-finisher-01.jpg");
  expect(captureFile("finalists", 3, 2)).toBe("round-03-finalists-board-02.jpg");
  expect(captureFile("field", 1, 5)).toBe("round-01-whole-field-05.jpg");
});

test("the winner screen is filed under the final's number, like everything else", () => {
  expect(captureFile("winner", 4, 1)).toBe("round-04-winner-01.jpg");
});

test("a show long enough to run past nine rounds still sorts", () => {
  expect(captureFile("first", 12, 1)).toBe("round-12-first-race-finisher-01.jpg");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/layout.test.ts`
Expected: FAIL — `Cannot find module './layout'`

- [ ] **Step 3: Write the implementation**

Create `src/capture/layout.ts`:

```ts
import type { MomentKind } from "./moments";

/** What each moment is called in a file name. The code's own words are too terse to browse by. */
const KIND: Record<MomentKind, string> = {
  first: "first-race-finisher",
  finalists: "finalists-board",
  field: "whole-field",
  winner: "winner",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Rounds are numbered from 1 here, as the admin and the board show them. */
export function captureFile(kind: MomentKind, roundNumber: number, index: number): string {
  return `round-${pad(roundNumber)}-${KIND[kind]}-${pad(index)}.jpg`;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/layout.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/capture/layout.ts src/capture/layout.test.ts
git commit -m "feat: name a capture for its round and what it shows"
```

---

### Task 2: The show folder name

**Files:**
- Modify: `src/capture/layout.ts`
- Test: `src/capture/layout.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/capture/layout.test.ts`:

```ts
import { showFolder, slugOf } from "./layout";
import { parseLog } from "../log";

const LOG = `
23:25:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
23:25:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
23:25:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
23:26:00.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1s
23:26:30.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
23:26:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

test("a show folder carries the day, the clock it started on and its name", () => {
  const at = new Date(2026, 8, 2, 23, 25, 5).getTime();
  expect(showFolder(at, "playlist-a-1")).toBe("show-2026-09-02T23h25-playlist-a-1");
});

test("a show that started after midnight is named for the day it actually started", () => {
  const at = new Date(2026, 8, 3, 0, 29, 12).getTime();
  expect(showFolder(at, "solos-5")).toBe("show-2026-09-03T00h29-solos-5");
});

test("a slug is the suggested show name, lowercased and hyphenated", () => {
  expect(slugOf(parseLog(LOG), 0)).toBe("playlist-a-1");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/layout.test.ts`
Expected: FAIL — `showFolder is not a function`

- [ ] **Step 3: Write the implementation**

Add to `src/capture/layout.ts`:

```ts
import { suggestShowName } from "../../site/admin-model";
import type { ParsedShow } from "../log";
```

```ts
/**
 * Local time, because the event is a local evening — the same reasoning `runFolder` is named by.
 * Minutes are enough: two shows cannot start in the same one.
 */
export function showFolder(startedAt: number, slug: string): string {
  const date = new Date(startedAt);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}h${pad(date.getMinutes())}`;
  return `show-${day}T${clock}${slug ? `-${slug}` : ""}`;
}

export function slugOf(shows: ParsedShow[], showIndex: number): string {
  return suggestShowName(shows, showIndex)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/layout.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/capture/layout.ts src/capture/layout.test.ts
git commit -m "feat: name a show's folder for the clock it started on"
```

---

### Task 3: Which folder each show owns, and the window it covers

**Files:**
- Modify: `src/capture/layout.ts`
- Test: `src/capture/layout.test.ts`

`showsOnDisk` is the single source of truth the rest of the plan reads: the folder name, and the span of time whose transcript lines belong to it.

- [ ] **Step 1: Write the failing test**

Append to `src/capture/layout.test.ts`:

```ts
import { showsOnDisk } from "./layout";

const DATE = "2026-09-02";
const utc = (clock: string) => Date.parse(`${DATE}T${clock}Z`);

const TWO_SHOWS = `
21:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
21:00:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
21:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
21:05:00.000: [HandleSuccessfulLogin] Selected show is playlist_b IsUltimatePartyEpisode: False
21:05:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
`;

test("each show that has loaded a round owns a folder, named for that round's clock", () => {
  const folders = showsOnDisk(parseLog(TWO_SHOWS), DATE);
  expect(folders.map((show) => [show.showIndex, show.dir])).toEqual([
    [0, showFolder(utc("21:00:05"), "playlist-a-1")],
    [1, showFolder(utc("21:05:05"), "playlist-b-1")],
  ]);
});

test("a show's window runs from its own start to the next show's, so its header lines are in it", () => {
  const [first, second] = showsOnDisk(parseLog(TWO_SHOWS), DATE);
  expect([first!.from, first!.to]).toEqual([utc("21:00:00"), utc("21:05:00")]);
  expect(second!.from).toBe(utc("21:05:00"));
});

test("the show still being played has no end to close its window at", () => {
  const folders = showsOnDisk(parseLog(TWO_SHOWS), DATE);
  expect(folders.at(-1)!.to).toBe(Infinity);
});

test("a show that has loaded no round yet has nothing to name a folder after", () => {
  const selected = `
21:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
`;
  expect(showsOnDisk(parseLog(selected), DATE)).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/layout.test.ts`
Expected: FAIL — `showsOnDisk is not a function`

- [ ] **Step 3: Write the implementation**

Add to `src/capture/layout.ts`:

```ts
import { absoluteTimes } from "../screenshots";
```

```ts
export interface ShowFolder {
  showIndex: number;
  /** Folder name, relative to the shows root. */
  dir: string;
  /** The show's own start, so the lines that announce it are in its transcript. */
  from: number;
  /** The next show's start, or open-ended for the one still being played. */
  to: number;
}

/**
 * Which folder each show owns and which span of the evening belongs to it. Naming, transcript
 * slicing and the folder filter all read this, so they cannot disagree about where a show ends.
 *
 * A show whose first round has not loaded is left out: there is nothing to name a folder after and
 * nothing yet to put in it.
 */
export function showsOnDisk(shows: ParsedShow[], date: string): ShowFolder[] {
  const times = absoluteTimes(shows, date);
  const folders: ShowFolder[] = [];

  times.forEach((span, showIndex) => {
    const firstRound = span.rounds.find((start) => start !== undefined);
    if (firstRound === undefined) return;
    const next = times.slice(showIndex + 1).find((later) => later.startedAt !== undefined);
    folders.push({
      showIndex,
      dir: showFolder(firstRound, slugOf(shows, showIndex)),
      from: span.startedAt ?? firstRound,
      to: next?.startedAt ?? Infinity,
    });
  });

  return folders;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/layout.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/capture/layout.ts src/capture/layout.test.ts
git commit -m "feat: say which folder each show owns and what it covers"
```

---

### Task 4: Which folders belong to tonight

**Files:**
- Modify: `src/capture/layout.ts`
- Test: `src/capture/layout.test.ts`

Show folders are flat under `shows/`, so the admin needs to know which are this evening's. An evening runs past midnight, so it is two days, never one.

- [ ] **Step 1: Write the failing test**

Append to `src/capture/layout.test.ts`:

```ts
import { showDirsFor } from "./layout";

test("an evening is the event day and the one it runs into, and nothing else", () => {
  const names = [
    "show-2026-09-01T22h10-solos-1",
    "show-2026-09-02T23h25-solos-4",
    "show-2026-09-03T00h29-solos-5",
    "show-2026-09-04T21h00-solos-6",
  ];
  expect(showDirsFor(names, "2026-09-02")).toEqual([
    "show-2026-09-02T23h25-solos-4",
    "show-2026-09-03T00h29-solos-5",
  ]);
});

test("an evening that ends a month still runs into the next one", () => {
  expect(showDirsFor(["show-2026-10-01T00h15-solos-2"], "2026-09-30")).toEqual([
    "show-2026-10-01T00h15-solos-2",
  ]);
});

test("anything that is not a show folder is skipped", () => {
  const names = ["segments", "2026-09-02.transcript.txt", "show-nonsense", "show-2026-09-02T23h25"];
  expect(showDirsFor(names, "2026-09-02")).toEqual(["show-2026-09-02T23h25"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/layout.test.ts`
Expected: FAIL — `showDirsFor is not a function`

- [ ] **Step 3: Write the implementation**

Add to `src/capture/layout.ts`:

```ts
const FOLDER = /^show-(\d{4}-\d{2}-\d{2})T\d{2}h\d{2}(?:-.*)?$/;

const DAY_MS = 86_400_000;

/**
 * The folders of one evening. Two days, never one: a session that runs past midnight names its
 * later shows for the day after the event's.
 */
export function showDirsFor(names: string[], date: string): string[] {
  const day = Date.parse(`${date}T00:00:00Z`);
  const nights = new Set([date, new Date(day + DAY_MS).toISOString().slice(0, 10)]);
  return names.filter((name) => {
    const stamped = FOLDER.exec(name);
    return stamped !== null && nights.has(stamped[1]!);
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/layout.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/capture/layout.ts src/capture/layout.test.ts
git commit -m "feat: pick out the show folders one evening left behind"
```

---

### Task 5: Move the clip's name into the layout module

**Files:**
- Modify: `src/capture/layout.ts`
- Modify: `scripts/serve.ts:328-335` (the `clipName` function)
- Test: `src/capture/layout.test.ts`

The clip keeps the name it has today. It moves out of `scripts/serve.ts` so every name in the tree is decided in one place.

- [ ] **Step 1: Write the failing test**

Append to `src/capture/layout.test.ts`:

```ts
import { clipFile } from "./layout";

test("a clip keeps the name that says what it is once dragged out of its folder", () => {
  expect(clipFile("2026-09-02", 3, "solos-4")).toBe("2026-09-02-show-04-solos-4");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/layout.test.ts`
Expected: FAIL — `clipFile is not a function`

- [ ] **Step 3: Write the implementation**

Add to `src/capture/layout.ts`:

```ts
/** No extension: `cutShowClip` adds `.mp4`. */
export function clipFile(date: string, showIndex: number, slug: string): string {
  return `${date}-show-${pad(showIndex + 1)}-${slug}`;
}
```

Leave `clipName` in `scripts/serve.ts` for now; Task 13 deletes it and switches the call site over. Until then the two exist side by side, which typechecks fine.

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/layout.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 5: Commit**

```bash
git add src/capture/layout.ts src/capture/layout.test.ts
git commit -m "refactor: decide the clip's name where every other name is decided"
```

---

### Task 6: A moment knows its round's number

**Files:**
- Modify: `src/capture/moments.ts:9-28` (the `Moment` interface), `:57-77` (the `moment` helper), `:80-108` (`momentsIn`)
- Test: `src/capture/moments.test.ts`

`roundIndex` is 0-based and absent on a winner. The file name needs a 1-based number that a winner has too. `momentKey` is deliberately left alone: changing it would make the ledger re-capture everything it already has.

- [ ] **Step 1: Write the failing test**

Append to `src/capture/moments.test.ts`:

```ts
test("every moment carries the round number its file will be named for", () => {
  const moments = momentsIn(parseLog(SHOW), DATE);
  expect(moments.map((m) => [m.kind, m.roundNumber])).toEqual([
    ["first", 1],
    ["field", 1],
    ["finalists", 1],
    ["first", 2],
    ["winner", 2],
  ]);
});

test("the ledger's key does not change, so nothing already captured is pulled twice", () => {
  const [first] = momentsIn(parseLog(SHOW), DATE);
  expect(momentKey(first!)).toBe("2026-09-05:0:first:0");
});
```

Check the order in the first expectation against what `momentsIn` sorts by (`at`, ascending) when the test fails — the fixture's `first` for round 1 is at `20:00:40`, `field` and `finalists` both at `20:00:44`, `first` for round 2 at `20:01:30`, `winner` at `20:01:35`.

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/moments.test.ts`
Expected: FAIL — `roundNumber` is `undefined` on every moment

- [ ] **Step 3: Write the implementation**

In `src/capture/moments.ts`, add to the `Moment` interface, under `roundIndex`:

```ts
  /** The round the file is named for, from 1. A winner takes the final's. */
  roundNumber: number;
```

Change the `moment` helper to take it:

```ts
function moment(
  kind: MomentKind,
  showIndex: number,
  date: string,
  at: number,
  roundNumber: number,
  roundIndex?: number,
): Moment {
  const window = WINDOW[kind];
  return {
    kind,
    showIndex,
    ...(roundIndex === undefined ? {} : { roundIndex }),
    roundNumber,
    date,
    at,
    from: at + window.from,
    to: at + window.to,
    fps: window.fps,
  };
}
```

Update the four call sites in `momentsIn`:

```ts
      if (at !== undefined)
        moments.push(moment("first", showIndex, date, at, roundIndex + 1, roundIndex));
```

```ts
    if (opened !== undefined) moments.push(moment("field", showIndex, date, opened, 1, 0));
```

```ts
    if (boardAt !== undefined)
      moments.push(moment("finalists", showIndex, date, boardAt, before + 1, before));
```

```ts
    if (span.wonAt !== undefined)
      moments.push(moment("winner", showIndex, date, span.wonAt, show.rounds.length));
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/moments.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/capture/moments.ts src/capture/moments.test.ts
git commit -m "feat: give a moment the round number its file is named for"
```

---

### Task 7: Frames land in the show's folder

**Files:**
- Modify: `src/capture/pipeline.ts:26-36` (`CaptureDeps`), `:44-56` (`monthOf`, `clockOf`), `:104-121` (the keep loop)
- Test: `src/capture/pipeline.test.ts:10-19` (the `MOMENT` fixture), `:22-50` (the harness), `:63-79`

- [ ] **Step 1: Write the failing test**

In `src/capture/pipeline.test.ts`, add `roundNumber: 3` to the `MOMENT` fixture, add `showsDir` and `showDir` to the harness's deps and drop `captureDir`:

```ts
const MOMENT: Moment = {
  kind: "first",
  showIndex: 0,
  roundIndex: 2,
  roundNumber: 3,
  date: "2026-09-05",
  at: AT,
  from: AT - 500,
  to: AT + 1500,
  fps: 30,
};
```

```ts
    deps: {
      ffmpeg: "ff",
      scratchDir,
      showsDir: `${dir}/shows`,
      showDir: "show-2026-09-05T20h00-solos-1",
```

Replace the test at `:63` with:

```ts
test("kept frames land in the show's own folder with the mtime of the instant they show", async () => {
  const { dir, deps, ran } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SEGMENTS, ledger, deps);
    expect(ran.length).toBe(1);
    expect(ran[0]![0]).toBe("ff");
    expect(kept).toEqual([
      "show-2026-09-05T20h00-solos-1/round-03-first-race-finisher-01.jpg",
      "show-2026-09-05T20h00-solos-1/round-03-first-race-finisher-02.jpg",
    ]);
    const info = await stat(`${dir}/shows/${kept[0]!}`);
    // Frame 1 of a 30fps pull that began at `from`.
    expect(Math.round(info.mtimeMs)).toBe(MOMENT.from);
    expect(ledger.pending("2026-09-05:0:first:2")).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/pipeline.test.ts`
Expected: FAIL — the kept paths still read `2026-09/auto-1-first-…`

- [ ] **Step 3: Write the implementation**

In `src/capture/pipeline.ts`, import the namer and drop the two date helpers:

```ts
import { captureFile } from "./layout";
```

Delete `monthOf` and `clockOf` entirely, and the `pad` const if nothing else uses it (check: `pad` is used only by those two).

In `CaptureDeps`, replace `captureDir: string;` with:

```ts
  showsDir: string;
  /** The folder of the show this moment belongs to, relative to `showsDir`. */
  showDir: string;
```

Replace the keep loop's body:

```ts
    for (const candidate of chosen) {
      const relative = `${deps.showDir}/${captureFile(moment.kind, moment.roundNumber, kept.length + 1)}`;
      await mkdir(`${deps.showsDir}/${deps.showDir}`, { recursive: true });
      await Bun.write(`${deps.showsDir}/${relative}`, Bun.file(candidate.path));
      const seconds = candidate.at / 1000;
      await utimes(`${deps.showsDir}/${relative}`, seconds, seconds);
      kept.push(relative);
    }
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/capture/pipeline.ts src/capture/pipeline.test.ts
git commit -m "feat: file a captured frame in the folder of the show it came from"
```

---

### Task 8: The clip lands in the same folder

**Files:**
- Modify: `src/capture/pipeline.ts:131-137` (`ClipDeps`), `:160-172` (the cut)
- Test: `src/capture/pipeline.test.ts:119-141` and the two `cutShowClip` tests after it

- [ ] **Step 1: Write the failing test**

In `src/capture/pipeline.test.ts`, change the clip test's expectation and deps:

```ts
test("a clip is cut with the streams copied, into the folder of the show it is", async () => {
  const { dir, deps, ran } = await harness();
  const clip = { showIndex: 2, date: "2026-09-05", from: AT - 10_000, to: AT + 5_000 };
  const ledger = new Ledger();
  try {
    const cut = await cutShowClip(clip, SEGMENTS, "2026-09-05-show-03-slime-climb", ledger, {
      ffmpeg: deps.ffmpeg,
      scratchDir: deps.scratchDir,
      showsDir: deps.showsDir,
      showDir: "show-2026-09-05T20h00-slime-climb-1",
      run: deps.run,
    });
    expect(cut).toEqual({
      out: `${dir}/shows/show-2026-09-05T20h00-slime-climb-1/2026-09-05-show-03-slime-climb.mp4`,
      gapped: false,
    });
    expect(ran[0]).toContain("copy");
    expect(await Bun.file(`${dir}/scratch/clip-2.txt`).text()).toBe(
      "file 'C:\\temp\\FallGuysCapture\\segments\\2026-09-05T20h00m00\\seg-00003.mkv'\n",
    );
    expect(ledger.pending("2026-09-05:2:clip")).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

In the two `cutShowClip` tests that follow it, add `showDir: "show-2026-09-05T20h00-x-1",` to the deps object and change `showsDir: `${dir}/shows`` to `showsDir: deps.showsDir`.

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/pipeline.test.ts`
Expected: FAIL — `out` is missing the show folder

- [ ] **Step 3: Write the implementation**

In `src/capture/pipeline.ts`, add to `ClipDeps`:

```ts
  /** The folder of the show this clip is, relative to `showsDir`. */
  showDir: string;
```

Replace the two lines that make the folder and the path:

```ts
  const folder = `${deps.showsDir}/${deps.showDir}`;
  await mkdir(folder, { recursive: true });

  const out = `${folder}/${name}.mp4`;
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/capture/pipeline.ts src/capture/pipeline.test.ts
git commit -m "feat: cut a show's clip into the show's own folder"
```

---

### Task 9: The capture tree has no `captures` folder

**Files:**
- Modify: `src/capture/paths.ts:49-59` (`captureFolders`)
- Test: `src/capture/paths.test.ts:50-53`

- [ ] **Step 1: Write the failing test**

Replace the `captureFolders` test in `src/capture/paths.test.ts`:

```ts
test("the capture dir's folders are laid out under whatever root it has", () => {
  const folders = captureFolders("/mnt/c/FallGuysCapture");
  expect(folders).toEqual({
    segments: "/mnt/c/FallGuysCapture/segments",
    shows: "/mnt/c/FallGuysCapture/shows",
    scratch: "/mnt/c/FallGuysCapture/scratch",
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/capture/paths.test.ts`
Expected: FAIL — the object still has a `captures` key

- [ ] **Step 3: Write the implementation**

`scripts/serve.ts` still reads `folders.captures` until Task 13, so `bun run typecheck` fails between here and there. That is expected; `bun test` stays green.

In `src/capture/paths.ts`, change the doc comment and drop the entry:

```ts
/** The three folders under the capture dir, so nothing has to spell them out twice. */
export function captureFolders(dir: string) {
  const at = (name: string) => `${dir.replace(/\/+$/, "")}/${name}`;
  return {
    segments: at("segments"),
    shows: at("shows"),
    scratch: at("scratch"),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/capture/paths.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/capture/paths.ts src/capture/paths.test.ts
git commit -m "refactor: drop the captures folder the show folders replaced"
```

---

### Task 10: The evening transcript sits at the capture root, and lines can be tapped

**Files:**
- Modify: `src/transcript/transcript.ts:24-46` (`TranscriptOptions`, `Transcript.write`), `:48-53` (`transcriptPath`)
- Test: `src/transcript/transcript.test.ts:88-90` and a new test

- [ ] **Step 1: Write the failing test**

Replace the `transcriptPath` test in `src/transcript/transcript.test.ts`:

```ts
test("the evening's transcript sits at the root of the capture tree", () => {
  expect(transcriptPath("/capture", "2026-09-02")).toBe("/capture/2026-09-02.transcript.txt");
});
```

And append:

```ts
test("a tap sees every line, whatever the terminal was told to show", () => {
  const tapped: Line[] = [];
  const transcript = new Transcript({
    level: "quiet",
    colour: false,
    out: () => {},
    tap: (line) => tapped.push(line),
  });
  transcript.write(SPOT);
  expect(tapped).toEqual([SPOT]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/transcript/transcript.test.ts`
Expected: FAIL — the path still has a month folder, and `tap` is not a known option

- [ ] **Step 3: Write the implementation**

In `src/transcript/transcript.ts`, add to `TranscriptOptions`:

```ts
  /** Every line, before any filtering, so the per-show transcripts can be cut from them. */
  tap?: (line: Entry) => void;
```

Call it first in `write`:

```ts
  write(line: Entry): void {
    this.options.tap?.(line);
    this.options.file?.(formatLine(line));
    if (this.shows(line)) this.options.out(formatLine(line, this.options.colour));
  }
```

Replace `transcriptPath`:

```ts
/** One file for the evening, at the root of the capture tree the show folders sit in. */
export function transcriptPath(captureDir: string, date: string): string {
  return `${captureDir.replace(/\/+$/, "")}/${date}.transcript.txt`;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/transcript/transcript.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/transcript/transcript.ts src/transcript/transcript.test.ts
git commit -m "feat: keep the evening's transcript at the capture root and let it be tapped"
```

---

### Task 11: One show's lines

**Files:**
- Create: `src/transcript/slice.ts`
- Test: `src/transcript/slice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/transcript/slice.test.ts`:

```ts
import { expect, test } from "bun:test";
import { linesBetween } from "./slice";
import type { Entry } from "./transcript";

const at = (clock: string) => Date.parse(`2026-09-02T${clock}Z`);
const line = (clock: string, text: string): Entry => ({
  kind: "entry",
  at: at(clock),
  lane: "ocr",
  text,
});

const EVENING: Entry[] = [
  { kind: "note", text: "server started" },
  line("20:59:00", "before"),
  line("21:00:00", "on the boundary"),
  line("21:02:00", "inside"),
  line("21:05:00", "the next show's"),
];

test("a show's lines run from its start, inclusive, to the next show's, exclusive", () => {
  expect(linesBetween(EVENING, at("21:00:00"), at("21:05:00")).map((e) => e.at)).toEqual([
    at("21:00:00"),
    at("21:02:00"),
  ]);
});

test("the show still being played takes everything from its start on", () => {
  expect(linesBetween(EVENING, at("21:00:00"), Infinity)).toHaveLength(3);
});

test("a line with no clock belongs to the server, not to a show", () => {
  expect(linesBetween(EVENING, 0, Infinity).some((e) => e.kind === "note")).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/transcript/slice.test.ts`
Expected: FAIL — `Cannot find module './slice'`

- [ ] **Step 3: Write the implementation**

Create `src/transcript/slice.ts`:

```ts
import type { Entry } from "./transcript";

/**
 * The lines of one show: `from` inclusive, `to` exclusive. A note carries no clock — it is the
 * server talking about itself, which belongs to the evening rather than to any show.
 */
export function linesBetween(entries: Entry[], from: number, to: number): Entry[] {
  return entries.filter((entry) => entry.kind !== "note" && entry.at >= from && entry.at < to);
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/transcript/slice.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/transcript/slice.ts src/transcript/slice.test.ts
git commit -m "feat: cut one show's lines out of the evening"
```

---

### Task 12: Listing the captures back out of the show folders

**Files:**
- Modify: `src/shot-folder.ts:1-8` (imports), append `listShowShots`
- Test: `src/shot-folder.test.ts`

`listShots` is untouched: ShareX still files by month.

- [ ] **Step 1: Write the failing test**

Append to `src/shot-folder.test.ts`, adding `listShowShots` to its existing `./shot-folder` import:

```ts
async function showFolders(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/shows-`);
  for (const name of [
    "show-2026-09-01T22h10-solos-1",
    "show-2026-09-02T23h25-solos-4",
    "show-2026-09-03T00h29-solos-5",
  ]) {
    await mkdir(`${dir}/${name}`);
  }
  await writeFile(`${dir}/show-2026-09-01T22h10-solos-1/round-01-winner-01.jpg`, "");
  await writeFile(`${dir}/show-2026-09-02T23h25-solos-4/round-01-whole-field-01.jpg`, "");
  await writeFile(`${dir}/show-2026-09-02T23h25-solos-4/transcript.txt`, "");
  await writeFile(`${dir}/show-2026-09-03T00h29-solos-5/2026-09-02-show-05-solos-5.mp4`, "");
  await writeFile(`${dir}/show-2026-09-03T00h29-solos-5/round-02-winner-01.jpg`, "");
  await utimes(`${dir}/show-2026-09-02T23h25-solos-4/round-01-whole-field-01.jpg`, TAKEN, TAKEN);
  return dir;
}

test("only this evening's show folders are read, images only", async () => {
  const shots = await listShowShots(await showFolders(), "2026-09-02");
  expect(shots.map((shot) => shot.file).sort()).toEqual([
    "show-2026-09-02T23h25-solos-4/round-01-whole-field-01.jpg",
    "show-2026-09-03T00h29-solos-5/round-02-winner-01.jpg",
  ]);
  expect(shots.every((shot) => shot.source === "auto")).toBe(true);
});

test("a capture carries the time it was taken, which is what places it", async () => {
  const shots = await listShowShots(await showFolders(), "2026-09-02");
  const field = shots.find((shot) => shot.file.includes("whole-field"))!;
  expect(field.takenAt).toBe(TAKEN.getTime());
});

test("a shows root that does not exist yet is empty rather than an error", async () => {
  expect(await listShowShots("/nowhere/at/all", "2026-09-02")).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/shot-folder.test.ts`
Expected: FAIL — `listShowShots is not a function`

- [ ] **Step 3: Write the implementation**

In `src/shot-folder.ts`, add the import:

```ts
import { showDirsFor } from "./capture/layout";
```

In `src/shot-folder.test.ts`, put `listShowShots` in the existing `./shot-folder` import rather than adding a second line. Then append to `src/shot-folder.ts`:

```ts
/**
 * The frames cut from the recording, which are filed under the show they came from rather than by
 * month. Placement still reads `takenAt`: the round in a file's name is for a human browsing the
 * folder, not for the admin.
 */
export async function listShowShots(root: string, date: string): Promise<Shot[]> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }

  const shots: Shot[] = [];
  for (const folder of showDirsFor(names, date)) {
    for (const name of await readdir(`${root}/${folder}`).catch(() => [])) {
      if (!IMAGES.test(name)) continue;
      const info = await stat(`${root}/${folder}/${name}`);
      if (info.isFile()) {
        shots.push({ file: `${folder}/${name}`, takenAt: info.mtimeMs, source: "auto" });
      }
    }
  }

  return shots;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/shot-folder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shot-folder.ts src/shot-folder.test.ts
git commit -m "feat: list the captures back out of the show folders"
```

---

### Task 13: Wire it up in the server

**Files:**
- Modify: `scripts/serve.ts` — imports (`:1-39`), `rootFor` (`:87-90`), `placed` (`:92-113`), `openTranscript` (`:151-156`), the `Transcript` (`:158-163`), `clipName` (`:328-335`), `sweepCaptures` (`:337-375`)

There is no test for `scripts/serve.ts` — it is wiring. Verify it by typecheck and by running it.

- [ ] **Step 1: Replace the imports that moved**

Delete `listShots` from the `shot-folder` import if it is no longer used — it still is, for ShareX. Add:

```ts
import { captureFolders, captureSettings, runFolder, runsIn } from "../src/capture/paths";
import { clipFile, showsOnDisk, slugOf, type ShowFolder } from "../src/capture/layout";
import { listShots, listShowShots, resolveShot } from "../src/shot-folder";
import { linesBetween } from "../src/transcript/slice";
import { clock, column, duration, formatLine } from "../src/transcript/format";
import type { Entry } from "../src/transcript/transcript";
```

- [ ] **Step 2: Point the auto root at the show folders**

Replace `rootFor`:

```ts
/** Which folder a capture lives in. ShareX's is only ever read; the frames are ours to write. */
async function rootFor(source: ShotSource): Promise<string | undefined> {
  if (source === "auto") return RECORD ? folders.shows : undefined;
  return findScreenshotDir();
}
```

Replace `placed`:

```ts
/** Screenshots are a reading aid: a missing or unreadable folder must not stop the admin loading. */
async function placed(dir: string | undefined, shows: ParsedShow[], date: string) {
  const shots: Shot[] = [];
  if (dir) {
    try {
      shots.push(...(await listShots(dir, date.slice(0, 7))));
    } catch {
      // One unreadable root must not cost the other.
    }
  }
  if (RECORD) {
    try {
      shots.push(...(await listShowShots(folders.shows, date)));
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

- [ ] **Step 3: Move the evening transcript to the capture root and tap it**

In `openTranscript`, replace `folders.captures` with `capture.dir`:

```ts
  transcriptFile = await openTranscriptFile(transcriptPath(capture.dir, date));
```

Above the `Transcript`, add the buffer, and give the `Transcript` the tap:

```ts
/** The evening's lines, which the per-show transcripts are cut from on every sweep. */
const entries: Entry[] = [];

const transcript = new Transcript({
  level: LEVEL,
  colour: process.stdout.isTTY === true,
  out: (text) => console.log(text),
  file: (text) => (transcriptFile ? transcriptFile(text) : waitingForFile.push(text)),
  tap: (line) => entries.push(line),
});
```

- [ ] **Step 4: Write the per-show transcripts**

Delete `clipName` and put this above `sweepCaptures`:

```ts
/** How many lines each show's transcript was last written with, so an unchanged one is not rewritten. */
const transcriptLines = new Map<string, number>();

/**
 * Rewritten rather than appended: a line can land long after the show it belongs to — an OCR read,
 * a fill, an admin edit — and rewriting is what gets it into the right folder.
 */
async function writeShowTranscripts(onDisk: ShowFolder[]): Promise<void> {
  for (const show of onDisk) {
    const lines = linesBetween(entries, show.from, show.to);
    if (lines.length === 0 || transcriptLines.get(show.dir) === lines.length) continue;
    const folder = `${folders.shows}/${show.dir}`;
    await mkdir(folder, { recursive: true });
    await Bun.write(`${folder}/transcript.txt`, `${lines.map((line) => formatLine(line)).join("\n")}\n`);
    transcriptLines.set(show.dir, lines.length);
  }
}
```

- [ ] **Step 5: Hand each job the folder its show owns**

Replace the body of `sweepCaptures` after `if (segments.length === 0) return;`:

```ts
  const onDisk = showsOnDisk(shows, day);
  const dirOf = new Map(onDisk.map((show) => [show.showIndex, show.dir]));
  await writeShowTranscripts(onDisk);

  for (const moment of momentsIn(shows, day)) {
    const showDir = dirOf.get(moment.showIndex);
    // A show whose first round has not loaded owns no folder yet, and its moments can wait.
    if (showDir === undefined || !ledger.pending(momentKey(moment))) continue;
    captureJobs.add(momentKey(moment), async () => {
      await captureMoment(moment, await segmentsNow(), ledger, {
        ffmpeg: capture.ffmpeg!,
        scratchDir: folders.scratch,
        showsDir: folders.shows,
        showDir,
        run: runFfmpeg,
        frameOf: frameFrom,
        screenOf: identify,
        now: () => Date.now(),
      });
    });
  }

  for (const clip of showClips(shows, day)) {
    const showDir = dirOf.get(clip.showIndex);
    if (showDir === undefined || !ledger.pending(clipKey(clip))) continue;
    const name = clipFile(day, clip.showIndex, slugOf(shows, clip.showIndex));
    captureJobs.add(clipKey(clip), async () => {
      const cut = await cutShowClip(clip, await segmentsNow(), name, ledger, {
        ffmpeg: capture.ffmpeg!,
        scratchDir: folders.scratch,
        showsDir: folders.shows,
        showDir,
        run: runFfmpeg,
      });
      if (cut?.gapped) console.log(`${name}.mp4 — a recording died inside it, so the clip jumps`);
    });
  }
```

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `bun run typecheck`
Expected: no output

Run: `bun test`
Expected: PASS, no failures

- [ ] **Step 7: Prove it on the real thing**

Run: `bun run dev --no-record` and open the admin. The capture panel is empty (nothing was recorded), and nothing throws.

Then, with a recording running (`CAPTURE_OUTPUT=<monitor> bun run dev`), play one show and confirm:
- `CAPTURE_DIR/shows/show-<stamp>-<slug>/` exists.
- It holds `round-01-first-race-finisher-01.jpg` and a `transcript.txt` with that show's lines only.
- `CAPTURE_DIR/<date>.transcript.txt` holds the whole evening.
- The admin's capture panel shows the frames under the right round.

- [ ] **Step 8: Commit**

```bash
git add scripts/serve.ts
git commit -m "feat: group every capture, clip and transcript under its own show"
```

---

### Task 14: The layout as documented

**Files:**
- Modify: `README.md:313-320` (the clip/segments paragraph)
- Modify: `docs/transcript.md:113-122` (the on-disk section)

- [ ] **Step 1: Update the README**

Replace the paragraph beginning "One mp4 per show lands in `CAPTURE_DIR/shows`":

```markdown
Everything one show produced lands in one folder, `CAPTURE_DIR/shows/show-2026-09-02T23h25-solos-4`,
named for the clock its first round loaded on:

| In the folder                        | What it is                                            |
|--------------------------------------|-------------------------------------------------------|
| `2026-09-02-show-04-solos-4.mp4`     | the show, cut from the first round to just past the victory screen without re-encoding |
| `transcript.txt`                     | that show's transcript lines, and no others           |
| `round-01-first-race-finisher-01.jpg`| the frames, named for the round and what they show    |

Rounds are numbered from 1; the winner screen is filed under the final's number. The whole evening's
transcript stays at `CAPTURE_DIR/2026-09-02.transcript.txt`.

The raw recording sits under `CAPTURE_DIR/segments` in one folder per run, stamped
`2026-09-02T21h41m03`: every start of the server, and every recovery from an ffmpeg that died
mid-event, gets its own, so nothing ever writes over footage that is already there. A clip cut
across such a recovery has a jump in it, and the console says which one. Nothing is cleaned up:
`CAPTURE_DIR` is yours to empty. A static desktop runs about 1.7 Mbps, so budget a few gigabytes an
hour and leave 30GB free.
```

- [ ] **Step 2: Update the transcript doc**

In `docs/transcript.md`, replace the on-disk block and the sentence under it:

~~~markdown
```
<CAPTURE_DIR>/2026-09-02.transcript.txt
<CAPTURE_DIR>/shows/show-2026-09-02T23h25-solos-4/transcript.txt
```

The evening's file is the record. Each show folder also holds its own lines, so a show is one
folder to zip and hand over. `listShowShots` only takes `.png/.jpg`, so it ignores both.
~~~

Leave the bullets under it as they are, and add one:

```markdown
- A show's own `transcript.txt` is rewritten, not appended: a line can land long after the show it
  belongs to. A server restart mid-evening leaves earlier shows' copies frozen at what they had.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/transcript.md
git commit -m "docs: describe the show folder every capture now lands in"
```

---

## Done when

- `bun test` passes and `bun run typecheck` is silent.
- A show played end to end leaves one folder holding its mp4, its `transcript.txt` and its frames,
  named `round-NN-<kind>-NN.jpg`.
- The admin's capture panel still shows each frame under the round it was taken in.
