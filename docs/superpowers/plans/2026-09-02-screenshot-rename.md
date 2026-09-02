# Naming the captures after what they show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Rename captures` button on the admin renames one show's screenshots to
`FG-01-Solos-04-ThinIce-Winner-OptinuxPrime-221403.png`, across both capture roots.

**Architecture:** A pure module builds the plan (`src/shot-names.ts`), a thin fs module applies it
in two passes and migrates the OCR cache (`src/shot-rename.ts`), `POST /api/rename` wires them to
the state the server already assembles, and the screenshot panel gets a button.

**Tech Stack:** Bun, TypeScript, `bun:test`. No new dependencies.

Design: [../specs/2026-09-02-screenshot-rename-design.md](../specs/2026-09-02-screenshot-rename-design.md)

---

## Background an implementer needs

- `PlacedShot` (`src/screenshots.ts`) is a capture already filed under a show and a round:
  `{ file, takenAt, source, showIndex?, slot?, roundIndex?, namesFinalists? }`. `file` is relative
  to its root and always starts with the `YYYY-MM/` folder, e.g. `2026-09/shot.png`.
- `source` is `"sharex"` (read from ShareX's folder) or `"auto"` (frames the recorder cut).
- `slot` is `"round" | "finalists" | "winners" | "show"`. `showIndex` is absent for a capture that
  matches no show — those are never renamed.
- `reads[file]` is a `ShotRead` (`src/ocr/read.ts`): `{ screen?: "grid" | "winner" | "toast", tokens }`.
- Player names come from `event.json` (`src/types.ts`: `TournamentEvent`), never from `tokens` —
  the admin may have typed over what OCR read.
- The OCR cache (`src/ocr/cache.ts`) keys on `cacheKey(file, mtimeMs)`. Renaming without moving the
  keys would re-read every image, seconds apiece.
- Tests set `process.env.TZ = "Europe/Brussels"` on the first line, before any import. Follow that.
- Run one file with `bun test src/shot-names.test.ts`. Run everything with `bun test`.
  Types: `bun run typecheck`.

## File structure

| File | Responsibility |
|--------------------------|--------------------------------------------------------------|
| `src/shot-names.ts`      | Pure: shots + reads + event → the list of renames to make      |
| `src/shot-names.test.ts` | Naming rules, numbering, tails, collisions, idempotency        |
| `src/shot-rename.ts`     | Applies a plan to disk, two passes, and moves the cache keys   |
| `src/shot-rename.test.ts`| Two-pass apply, conflict abort, cache migration, in a temp dir |
| `scripts/serve.ts`       | `POST /api/rename`                                             |
| `site/admin.ts`          | The button in the screenshot panel                             |
| `site/admin.css`         | One rule for the button row                                    |
| `README.md`              | The ShareX folder is no longer read-only                       |

---

### Task 1: The name of a round capture

**Files:**
- Create: `src/shot-names.ts`
- Test: `src/shot-names.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Names carry a wall-clock time, and the event runs on Belgian time.
process.env.TZ = "Europe/Brussels";

import { expect, test } from "bun:test";
import { renamePlan } from "./shot-names";
import type { PlacedShot } from "./screenshots";
import type { ShotRead } from "./ocr/read";
import type { ParsedShow } from "./log";
import type { TournamentEvent } from "./types";

const DATE = "2026-09-01";

/** Belgian summer time is UTC+2, so 20:14:03Z is 22:14:03 on the admin's clock. */
function at(clock: string): number {
  return Date.parse(`${DATE}T${clock}Z`);
}

function shot(file: string, clock: string, extra: Partial<PlacedShot> = {}): PlacedShot {
  return { file: `2026-09/${file}`, takenAt: at(clock), source: "sharex", showIndex: 0, ...extra };
}

const EVENT: TournamentEvent = {
  name: "FOM 2026",
  date: DATE,
  penalties: [],
  shows: [
    {
      name: "Day at the Races Solo",
      rounds: [
        { map: "Hex-A-Gone", type: "race", first: "Optinux_Prime" },
        { map: "Thin Ice", type: "final" },
      ],
      finalists: ["Optinux_Prime", "Serxav_9"],
      winners: ["Serxav_9"],
    },
  ],
};

const PARSED: ParsedShow[] = [{ showId: "show_race_solo", rounds: [] }];

const NO_READS: Record<string, ShotRead> = {};

test("a capture in a round is named after the show and the round", () => {
  const shots = [shot("a.png", "20:14:03", { slot: "round", roundIndex: 0 })];

  expect(renamePlan(shots, NO_READS, EVENT, PARSED, 0)).toEqual([
    {
      source: "sharex",
      from: "2026-09/a.png",
      to: "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Screen-221403.png",
      takenAt: at("20:14:03"),
    },
  ]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/shot-names.test.ts`
Expected: FAIL — `Cannot find module './shot-names'`.

- [ ] **Step 3: Write the module**

```ts
import type { ParsedShow } from "./log";
import type { PlacedShot, ShotSource } from "./screenshots";
import type { Show, TournamentEvent } from "./types";

export interface Rename {
  source: ShotSource;
  /** Both paths are relative to the capture's own root, folder included. */
  from: string;
  to: string;
  /** The capture's mtime, which is what its cache key is built from. */
  takenAt: number;
}

const PREFIX = "FG";

/** Dashes separate the parts of a name, so a dash inside one would read as a part break. */
function segment(text: string): string {
  return text.replace(/[^A-Za-z0-9_]/g, "");
}

const pad = (value: number) => String(value).padStart(2, "0");

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** `HHmmss` on the clock the admin puts beside every capture. */
function clockOf(at: number): string {
  return CLOCK.format(at).replace(/\D/g, "");
}

function extensionOf(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot === -1 ? "" : file.slice(dot);
}

function folderOf(file: string): string {
  return file.slice(0, file.lastIndexOf("/") + 1);
}

function roundPart(
  shot: PlacedShot,
  show: Show | undefined,
  parsed: ParsedShow | undefined,
): string | undefined {
  if (shot.slot !== "round" || shot.roundIndex === undefined) return undefined;
  const map = show?.rounds[shot.roundIndex]?.map ?? parsed?.rounds[shot.roundIndex]?.name;
  return `${pad(shot.roundIndex + 1)}-${segment(map ?? "Round")}`;
}

/** What one show's captures should be called. Only the moves are returned. */
export function renamePlan(
  shots: PlacedShot[],
  // Which screen each capture shows. Unused until Task 2 fills the tail in.
  _reads: Record<string, unknown>,
  event: TournamentEvent,
  shows: ParsedShow[],
  showIndex: number,
): Rename[] {
  const show = event.shows[showIndex];
  const parsed = shows[showIndex];
  const showName = segment(show?.name ?? parsed?.showId ?? "Show") || "Show";

  const mine = shots
    .filter((shot) => shot.showIndex === showIndex)
    .sort((a, b) => a.takenAt - b.takenAt);

  return mine.flatMap((shot) => {
    const base = [
      PREFIX,
      pad(showIndex + 1),
      showName,
      roundPart(shot, show, parsed) ?? "Between",
      // Which screen it is arrives in Task 2.
      "Screen",
      clockOf(shot.takenAt),
    ].join("-");

    const to = `${folderOf(shot.file)}${base}${extensionOf(shot.file)}`;
    if (to === shot.file) return [];
    return [{ source: shot.source, from: shot.file, to, takenAt: shot.takenAt }];
  });
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/shot-names.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/shot-names.ts src/shot-names.test.ts
git commit -m "feat: name a capture after its show and round"
```

---

### Task 2: What the screen is

**Files:**
- Modify: `src/shot-names.ts` (`tailOf`)
- Test: `src/shot-names.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/shot-names.test.ts`:

```ts
function planFor(shots: PlacedShot[], reads: Record<string, ShotRead>): string[] {
  return renamePlan(shots, reads, EVENT, PARSED, 0).map((move) => move.to);
}

test("a qualified toast is named after the round's first finisher", () => {
  const shots = [shot("a.png", "20:14:03", { slot: "round", roundIndex: 0 })];
  const reads = { "2026-09/a.png": { screen: "toast" as const, tokens: [] } };

  expect(planFor(shots, reads)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Qualified-Optinux_Prime-221403.png",
  ]);
});

test("a toast on a round nobody has been typed in for is just Qualified", () => {
  const shots = [shot("a.png", "20:14:03", { slot: "round", roundIndex: 1 })];
  const reads = { "2026-09/a.png": { screen: "toast" as const, tokens: [] } };

  expect(planFor(shots, reads)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-02-ThinIce-Qualified-221403.png",
  ]);
});

test("the board naming the finalists is told apart from the one after every other round", () => {
  const shots = [
    shot("a.png", "20:14:03", { slot: "round", roundIndex: 0 }),
    shot("b.png", "20:15:03", { slot: "round", roundIndex: 0, namesFinalists: true }),
  ];
  const reads = {
    "2026-09/a.png": { screen: "grid" as const, tokens: [] },
    "2026-09/b.png": { screen: "grid" as const, tokens: [] },
  };

  expect(planFor(shots, reads)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Board-221403.png",
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Finalists-221503.png",
  ]);
});

test("the winner screen carries every winner", () => {
  const twoWinners: TournamentEvent = {
    ...EVENT,
    shows: [{ ...EVENT.shows[0]!, winners: ["Serxav_9", "Optinux_Prime"] }],
  };
  const shots = [shot("a.png", "20:20:00", { slot: "winners" })];
  const reads = { "2026-09/a.png": { screen: "winner" as const, tokens: [] } };

  expect(renamePlan(shots, reads, twoWinners, PARSED, 0).map((move) => move.to)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-02-ThinIce-Winner-Serxav_9-Optinux_Prime-222000.png",
  ]);
});

test("a winner screen for a show nobody has typed in is just Winner", () => {
  const blank: TournamentEvent = { ...EVENT, shows: [{ ...EVENT.shows[0]!, winners: [] }] };
  const shots = [shot("a.png", "20:20:00", { slot: "winners" })];
  const reads = { "2026-09/a.png": { screen: "winner" as const, tokens: [] } };

  expect(renamePlan(shots, reads, blank, PARSED, 0).map((move) => move.to)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-02-ThinIce-Winner-222000.png",
  ]);
});
```

Note: the last three tests also need Task 3's rule that `finalists` and `winners` captures carry the
final's round number. They will not pass until Task 3 is done — that is expected, and Task 3 says so.

- [ ] **Step 2: Run and watch them fail**

Run: `bun test src/shot-names.test.ts`
Expected: FAIL — every new name still ends in `Screen`.

- [ ] **Step 3: Add `tailOf` and let the plan use it**

Add to `src/shot-names.ts`, above `roundPart`:

```ts
function tailOf(shot: PlacedShot, read: ShotRead | undefined, show: Show | undefined): string {
  if (read?.screen === "toast") {
    const first = shot.roundIndex === undefined ? undefined : show?.rounds[shot.roundIndex]?.first;
    return first ? `Qualified-${segment(first)}` : "Qualified";
  }

  if (read?.screen === "winner") {
    const winners = (show?.winners ?? []).map(segment).filter(Boolean);
    return winners.length > 0 ? `Winner-${winners.join("-")}` : "Winner";
  }

  // The board comes up after every round; only the one after the round before the final names
  // the finalists.
  if (read?.screen === "grid") return shot.namesFinalists === true ? "Finalists" : "Board";

  return "Screen";
}
```

Restore the real parameter and the import it needs, at the top of `src/shot-names.ts`:

```ts
import type { ShotRead } from "./ocr/read";
```

```ts
export function renamePlan(
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
  event: TournamentEvent,
```

and in the name, swap the placeholder for the call:

```ts
      roundPart(shot, show, parsed) ?? "Between",
      tailOf(shot, reads[shot.file], show),
      clockOf(shot.takenAt),
```

- [ ] **Step 4: Run and check what is left**

Run: `bun test src/shot-names.test.ts`
Expected: the two toast tests and the board test PASS. The two winner tests still FAIL, on the round
number: they say `02-ThinIce`, the code has no round for a `winners` capture and writes `Between`.
Task 3 fixes that.

- [ ] **Step 5: Commit**

```bash
git add src/shot-names.ts src/shot-names.test.ts
git commit -m "feat: name a capture after the screen it shows"
```

---

### Task 3: The screens around the final, and shows nobody has typed in

**Files:**
- Modify: `src/shot-names.ts` (`roundPart`)
- Test: `src/shot-names.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/shot-names.test.ts`:

```ts
test("a capture between rounds has no round", () => {
  const shots = [shot("a.png", "20:14:03", { slot: "show" })];

  expect(planFor(shots, NO_READS)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-Between-Screen-221403.png",
  ]);
});

test("a capture matching no show is left alone", () => {
  const shots = [shot("a.png", "20:14:03", { showIndex: undefined })];

  expect(renamePlan(shots, NO_READS, EVENT, PARSED, 0)).toEqual([]);
});

test("a show nobody has typed in falls back to what the log parsed", () => {
  const empty: TournamentEvent = { ...EVENT, shows: [] };
  const parsed: ParsedShow[] = [
    {
      showId: "show_race_solo",
      rounds: [
        {
          id: "round_hexagone",
          name: "Hex-A-Gone",
          type: "race",
          isFinal: false,
          timedOut: false,
          present: [],
          qualified: [],
          eliminated: [],
        },
      ],
    },
  ];
  const shots = [shot("a.png", "20:14:03", { slot: "round", roundIndex: 0 })];

  expect(renamePlan(shots, NO_READS, empty, parsed, 0).map((move) => move.to)).toEqual([
    "2026-09/FG-01-show_race_solo-01-HexAGone-Screen-221403.png",
  ]);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `bun test src/shot-names.test.ts`
Expected: FAIL — the two winner tests from Task 2 plus the fallback test. The `between` and
`unmatched` tests already pass.

- [ ] **Step 3: Give the final's screens the final's round number**

Replace `roundPart` in `src/shot-names.ts`:

```ts
function roundPart(
  shot: PlacedShot,
  show: Show | undefined,
  parsed: ParsedShow | undefined,
): string | undefined {
  // The board of finalists and the winner screen both belong to the final that was just played.
  const last = (show?.rounds.length ?? parsed?.rounds.length ?? 0) - 1;
  const index =
    shot.slot === "round"
      ? shot.roundIndex
      : shot.slot === "finalists" || shot.slot === "winners"
        ? last
        : undefined;
  if (index === undefined || index < 0) return undefined;

  const map = show?.rounds[index]?.map ?? parsed?.rounds[index]?.name;
  return `${pad(index + 1)}-${segment(map ?? "Round")}`;
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `bun test src/shot-names.test.ts`
Expected: PASS, all tests so far.

- [ ] **Step 5: Commit**

```bash
git add src/shot-names.ts src/shot-names.test.ts
git commit -m "feat: file the final's screens under the final's round"
```

---

### Task 4: Two captures in the same second

**Files:**
- Modify: `src/shot-names.ts` (`renamePlan`)
- Test: `src/shot-names.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/shot-names.test.ts`:

```ts
test("captures landing on the same name are numbered in capture order", () => {
  const shots = [
    shot("b.png", "20:14:03", { slot: "round", roundIndex: 0 }),
    shot("a.png", "20:14:03", { slot: "round", roundIndex: 0 }),
    shot("c.png", "20:14:03", { slot: "round", roundIndex: 0 }),
  ];
  // Sorting is by takenAt, which ties here, so the input order stands.
  expect(planFor(shots, NO_READS)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Screen-221403.png",
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Screen-221403-2.png",
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Screen-221403-3.png",
  ]);
});

test("a capture already carrying its name is not moved", () => {
  const shots = [
    shot("FG-01-DayAtTheRacesSolo-01-HexAGone-Screen-221403.png", "20:14:03", {
      slot: "round",
      roundIndex: 0,
    }),
  ];

  expect(renamePlan(shots, NO_READS, EVENT, PARSED, 0)).toEqual([]);
});

test("renaming again after a name is corrected does not pile up", () => {
  const shots = [
    shot("FG-01-DayAtTheRacesSolo-01-HexAGone-Qualified-Wrong-221403.png", "20:14:03", {
      slot: "round",
      roundIndex: 0,
    }),
  ];
  const reads = {
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Qualified-Wrong-221403.png": {
      screen: "toast" as const,
      tokens: [],
    },
  };

  expect(planFor(shots, reads)).toEqual([
    "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Qualified-Optinux_Prime-221403.png",
  ]);
});

test("the auto root keeps its own source", () => {
  const shots = [
    shot("auto-1-winner-221403-1.jpg", "20:14:03", {
      source: "auto",
      slot: "round",
      roundIndex: 0,
    }),
  ];

  expect(renamePlan(shots, NO_READS, EVENT, PARSED, 0)).toEqual([
    {
      source: "auto",
      from: "2026-09/auto-1-winner-221403-1.jpg",
      to: "2026-09/FG-01-DayAtTheRacesSolo-01-HexAGone-Screen-221403.jpg",
      takenAt: at("20:14:03"),
    },
  ]);
});
```

- [ ] **Step 2: Run and watch the first one fail**

Run: `bun test src/shot-names.test.ts`
Expected: FAIL on the numbering test — all three want the same name. The other three pass already.

- [ ] **Step 3: Number the ties**

Replace the `return mine.flatMap(...)` block at the end of `renamePlan` in `src/shot-names.ts`:

```ts
  const taken = new Map<string, number>();
  const plan: Rename[] = [];

  for (const shot of mine) {
    const base = [
      PREFIX,
      pad(showIndex + 1),
      showName,
      roundPart(shot, show, parsed) ?? "Between",
      tailOf(shot, reads[shot.file], show),
      clockOf(shot.takenAt),
    ].join("-");

    const nth = (taken.get(base) ?? 0) + 1;
    taken.set(base, nth);

    const suffix = nth > 1 ? `-${nth}` : "";
    const to = `${folderOf(shot.file)}${base}${suffix}${extensionOf(shot.file)}`;
    if (to !== shot.file) {
      plan.push({ source: shot.source, from: shot.file, to, takenAt: shot.takenAt });
    }
  }

  return plan;
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `bun test src/shot-names.test.ts && bun run typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/shot-names.ts src/shot-names.test.ts
git commit -m "feat: number captures that land on the same name"
```

---

### Task 5: Applying a plan without losing a file

**Files:**
- Create: `src/shot-rename.ts`
- Test: `src/shot-rename.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRenames } from "./shot-rename";
import { cacheKey, type ReadCache } from "./ocr/cache";
import type { Rename } from "./shot-names";

async function root(files: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shots-"));
  await mkdir(join(dir, "2026-09"), { recursive: true });
  for (const file of files) await writeFile(join(dir, "2026-09", file), file);
  return dir;
}

const move = (from: string, to: string, takenAt = 1000): Rename => ({
  source: "sharex",
  from: `2026-09/${from}`,
  to: `2026-09/${to}`,
  takenAt,
});

test("a plan renames every file it names", async () => {
  const dir = await root(["a.png", "b.png"]);

  const renamed = await applyRenames(
    [move("a.png", "FG-1.png"), move("b.png", "FG-2.png")],
    { sharex: dir },
    {},
  );

  expect(renamed).toBe(2);
  expect((await readdir(join(dir, "2026-09"))).sort()).toEqual(["FG-1.png", "FG-2.png"]);
});

test("two captures swapping names keep both files", async () => {
  const dir = await root(["one.png", "two.png"]);

  await applyRenames([move("one.png", "two.png"), move("two.png", "one.png")], { sharex: dir }, {});

  expect(await Bun.file(join(dir, "2026-09", "two.png")).text()).toBe("one.png");
  expect(await Bun.file(join(dir, "2026-09", "one.png")).text()).toBe("two.png");
});

test("a target already on disk aborts the whole plan", async () => {
  const dir = await root(["a.png", "b.png", "FG-1.png"]);

  await expect(
    applyRenames([move("a.png", "FG-1.png"), move("b.png", "FG-2.png")], { sharex: dir }, {}),
  ).rejects.toThrow("FG-1.png");

  expect((await readdir(join(dir, "2026-09"))).sort()).toEqual(["FG-1.png", "a.png", "b.png"]);
});

test("two captures wanting one name aborts the whole plan", async () => {
  const dir = await root(["a.png", "b.png"]);

  await expect(
    applyRenames([move("a.png", "FG-1.png"), move("b.png", "FG-1.png")], { sharex: dir }, {}),
  ).rejects.toThrow("FG-1.png");

  expect((await readdir(join(dir, "2026-09"))).sort()).toEqual(["a.png", "b.png"]);
});

test("what was read off a capture follows it to its new name", async () => {
  const dir = await root(["a.png"]);
  const cache: ReadCache = { [cacheKey("2026-09/a.png", 1000)]: { screen: "winner", tokens: ["X"] } };

  await applyRenames([move("a.png", "FG-1.png")], { sharex: dir }, cache);

  expect(cache[cacheKey("2026-09/FG-1.png", 1000)]).toEqual({ screen: "winner", tokens: ["X"] });
  expect(cache[cacheKey("2026-09/a.png", 1000)]).toBeUndefined();
});

test("a name walking out of its root is refused", async () => {
  const dir = await root(["a.png"]);

  await expect(
    applyRenames([move("a.png", "../escaped.png")], { sharex: dir }, {}),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `bun test src/shot-rename.test.ts`
Expected: FAIL — `Cannot find module './shot-rename'`.

- [ ] **Step 3: Write the module**

```ts
import { rename, stat } from "node:fs/promises";
import { cacheKey, type ReadCache } from "./ocr/cache";
import { resolveShot } from "./shot-folder";
import type { ShotSource } from "./screenshots";
import type { Rename } from "./shot-names";

export type RenameRoots = Partial<Record<ShotSource, string>>;

/** The suffix a file wears between the two passes. It is not an image name, so a listing skips it. */
const HALFWAY = ".renaming";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves every capture the plan names, or none of them. Nothing is overwritten: a target already on
 * disk or wanted twice stops the run before the first file moves.
 */
export async function applyRenames(
  plan: Rename[],
  roots: RenameRoots,
  cache: ReadCache,
): Promise<number> {
  const moves = plan.map((move) => {
    const root = roots[move.source];
    const from = root === undefined ? undefined : resolveShot(root, move.from);
    const to = root === undefined ? undefined : resolveShot(root, move.to);
    if (from === undefined || to === undefined) {
      throw new Error(`Cannot rename ${move.from} to ${move.to}: outside the capture folder`);
    }
    return { move, from, to };
  });

  const sources = new Set(moves.map((step) => step.from));
  const targets = new Set<string>();
  for (const step of moves) {
    if (targets.has(step.to)) throw new Error(`Two captures both want ${step.move.to}`);
    targets.add(step.to);
    // A target that is also a source is fine: that file is about to move out of the way.
    if (!sources.has(step.to) && (await exists(step.to))) {
      throw new Error(`${step.move.to} is already there`);
    }
  }

  // Two passes, because a correction can leave two captures swapping names and one pass would
  // write over the file the other one still needs.
  for (const step of moves) await rename(step.from, `${step.from}${HALFWAY}`);
  for (const step of moves) await rename(`${step.from}${HALFWAY}`, step.to);

  for (const { move } of moves) {
    const was = cacheKey(move.from, move.takenAt);
    const read = cache[was];
    if (read === undefined) continue;
    cache[cacheKey(move.to, move.takenAt)] = read;
    delete cache[was];
  }

  return moves.length;
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `bun test src/shot-rename.test.ts && bun run typecheck`
Expected: PASS, 6 tests, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/shot-rename.ts src/shot-rename.test.ts
git commit -m "feat: apply a rename plan without ever overwriting a capture"
```

---

### Task 6: The endpoint

**Files:**
- Modify: `scripts/serve.ts`

There are no tests here: `scripts/serve.ts` has none today, and the logic worth testing is already
covered in Tasks 1–5. Verification is by hand, in Step 3.

- [ ] **Step 1: Add the imports**

Beside the other `../src/...` imports at the top of `scripts/serve.ts`:

```ts
import { renamePlan } from "../src/shot-names";
import { applyRenames, type RenameRoots } from "../src/shot-rename";
```

- [ ] **Step 2: Add the route**

In `scripts/serve.ts`, immediately after the `POST /api/publish` block:

```ts
    if (request.method === "POST" && pathname === "/api/rename") {
      const { showIndex } = (await request.json()) as { showIndex?: number };
      if (!Number.isInteger(showIndex)) return json({ error: "showIndex is required" }, 400);

      const event = (await Bun.file(EVENT_PATH).json()) as TournamentEvent;
      const shows = await parsedShows(await findLog());
      const shotDir = await findScreenshotDir();
      const shots = await placed(shotDir, shows, event.date);
      const autoRoot = await rootFor("auto");
      const roots: RenameRoots = {
        ...(shotDir === undefined ? {} : { sharex: shotDir }),
        ...(autoRoot === undefined ? {} : { auto: autoRoot }),
      };

      const plan = renamePlan(shots, readsFor(shots), event, shows, showIndex as number);
      const mine = shots.filter((shot) => shot.showIndex === showIndex).length;
      try {
        const renamed = await applyRenames(plan, roots, reader.cache());
        return json({ renamed, skipped: mine - renamed });
      } catch (error) {
        return json({ error: String(error) }, 409);
      }
    }
```

- [ ] **Step 3: Check it by hand**

Run in one terminal: `bun run dev`

Then, with a show recorded in `data/event.json` and captures in the folder:

```bash
curl -s -X POST localhost:3000/api/rename \
  -H 'content-type: application/json' -d '{"showIndex":0}'
```

Expected: `{"renamed":N,"skipped":M}` and the files in the ShareX month folder now named `FG-01-…`.
Run the same command again: expected `{"renamed":0,"skipped":N}` — the names are already right.

- [ ] **Step 4: Check nothing else broke**

Run: `bun test && bun run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/serve.ts
git commit -m "feat: serve a rename of one show's captures"
```

---

### Task 7: The button

**Files:**
- Modify: `site/admin.ts` (`renderShots`, around line 369)
- Modify: `site/admin.css`

- [ ] **Step 1: Add the imports and the state the message lives in**

At the top of `site/admin.ts`, beside `let panelShowing = "";`:

```ts
/** The last thing the rename said, so a poll redrawing the panel does not wipe it. */
let renameSaid: { text: string; ok: boolean } | undefined;
```

- [ ] **Step 2: Build the button**

Add above `renderShots` in `site/admin.ts`:

```ts
function renameButton(): HTMLElement {
  const button = el("button", { type: "button" }, ["Rename captures"]);
  const said = el("p", { class: renameSaid?.ok === false ? "status bad" : "status ok" }, [
    renameSaid?.text ?? "",
  ]);

  button.addEventListener("click", async () => {
    button.disabled = true;
    renameSaid = { text: "Renaming…", ok: true };
    renderShots();
    try {
      const response = await fetch("/api/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ showIndex: selectedShow }),
      });
      const result = (await response.json()) as {
        renamed?: number;
        skipped?: number;
        error?: string;
      };
      renameSaid = result.error
        ? { text: result.error, ok: false }
        : { text: `Renamed ${result.renamed}, left ${result.skipped} alone.`, ok: true };
      // Every fill names the capture it was read off, so both go stale together.
      const fresh = (await (await fetch("/api/state")).json()) as State;
      state.shots = fresh.shots;
      state.fills = fresh.fills;
    } catch (error) {
      renameSaid = { text: `Could not rename: ${error}`, ok: false };
    }
    render();
  });

  return el("div", { class: "rename-row" }, [button, said]);
}
```

- [ ] **Step 3: Put it in the panel**

In `renderShots`, add it to the `replaceChildren` call, right after the `h2`:

```ts
  target.replaceChildren(
    el("h2", {}, [`Show ${selectedShow + 1} · ${SLOT_LABELS[selection.slot]}`]),
    renameButton(),
    ...shotImages(shotsForSlot(state.shots, selectedShow, selection)),
```

- [ ] **Step 4: Style the row**

Append to `site/admin.css`:

```css
.shot-panel .rename-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; }
.shot-panel .rename-row .status { margin: 0; font-size: 0.8rem; }
```

- [ ] **Step 5: Check it in the browser**

Run: `bun run dev`, open <http://localhost:3000/admin>, pick a show with captures, click
**Rename captures**.
Expected: the message reads `Renamed N, left M alone.` and the filenames under each capture in the
panel now read `FG-01-…`. Clicking again reads `Renamed 0, left N alone.`

- [ ] **Step 6: Check nothing else broke**

Run: `bun test && bun run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add site/admin.ts site/admin.css
git commit -m "feat: rename a show's captures from the admin"
```

---

### Task 8: Say so in the README

**Files:**
- Modify: `README.md` (the **Screenshots** section)

- [ ] **Step 1: Correct the read-only claim**

In `README.md`, the Screenshots section says:

```
It reads `Documents/ShareX/Screenshots` for any user on the C: drive, and inside it only the
month folder the event falls in, taken from `date` in `event.json`. Set `SHAREX_DIR` to
override. Nothing is copied and nothing is committed — the folder is only ever read.
```

Replace the last sentence so it reads:

```
It reads `Documents/ShareX/Screenshots` for any user on the C: drive, and inside it only the
month folder the event falls in, taken from `date` in `event.json`. Set `SHAREX_DIR` to
override. Nothing is copied and nothing is committed; the only thing written there is a
rename, and only when asked for.
```

- [ ] **Step 2: Describe the button**

Append to the **Screenshots** section of `README.md`:

```markdown
### Renaming the captures

**Rename captures** in the screenshot panel renames the show's captures to say what they are:

```
FG-01-Solos-04-ThinIce-Winner-OptinuxPrime-221403.png
```

Show number, show, round number, round, which screen it is, whoever is named on it, and the time it
was taken on Belgian clocks. Names come from `event.json`, so rename after the show is ticked off
and the filenames carry the corrected names. Clicking again after fixing a name renames again
rather than adding to it.

Both capture folders are covered — ShareX's and the frames cut from the recording. Captures
matching no show are left alone. Placement is by modified time, which a rename does not touch, so a
renamed capture stays in its round.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe renaming the captures"
```

---

## Finishing

- [ ] Run `bun test && bun run typecheck` one last time. Both must be clean.
- [ ] Use `superpowers:finishing-a-development-branch` to merge the worktree back into `main`.
