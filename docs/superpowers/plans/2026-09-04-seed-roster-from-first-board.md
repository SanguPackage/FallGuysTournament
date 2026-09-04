# Seed the roster from the first qualification board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `data/players.json` holds no registered player, the first show's round-1 qualification board becomes the official roster, so a test run has a field and a leaderboard without anyone typing names in.

**Architecture:** One pure function `seededRoster` in a new `src/ocr/seed.ts` decides what the roster should become; `scripts/serve.ts` is the only place that writes the file. The bare-roster test is the whole safeguard against this firing on game day — a registered roster never satisfies it.

**Tech Stack:** TypeScript, Bun (`bun test`, `Bun.write`), existing OCR pipeline in `src/ocr/`.

**Spec:** `docs/superpowers/specs/2026-09-04-seed-roster-from-first-board-design.md`

---

## File Structure

| File | Responsibility |
|-----------------------|-------------------------------------------------------------------|
| `src/ocr/seed.ts`     | Create. Pure: given players, shots and reads, return the roster to write, or `undefined`. |
| `src/ocr/seed.test.ts`| Create. Every rule in the table above, one test each.              |
| `scripts/serve.ts`    | Modify, `/api/state` handler around line 462. Write the file, use the new roster, log a line. |

Types it leans on, all already defined:

- `Player`, `Players` — `src/types.ts`
- `PlacedShot` — `src/screenshots.ts:21` (`file`, `takenAt`, `source`, optional `showIndex`, `slot`, `roundIndex`)
- `ShotRead` — `src/ocr/read.ts:10` (`screen?: Screen`, `tokens: string[]`)

---

### Task 1: `seededRoster` seeds a bare roster

**Files:**
- Create: `src/ocr/seed.ts`
- Test: `src/ocr/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ocr/seed.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { seededRoster } from "./seed";
import type { PlacedShot } from "../screenshots";
import type { ShotRead } from "./read";
import type { Player } from "../types";

function shot(file: string, extra: Partial<PlacedShot> = {}): PlacedShot {
  return { file, takenAt: 0, source: "sharex", showIndex: 0, roundIndex: 0, ...extra };
}

const ADMIN: Player = { ingame: "AnotherAccount58", fom: "Wouter_Van_Schandevijl", admin: true };

test("a roster with nobody registered takes its players off the first board", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([
    { ingame: "Diego_9942" },
    { ingame: "Serxav_9" },
  ]);
});

test("the admin keeps their row and their fields", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([ADMIN], shots, reads)).toEqual([ADMIN, { ingame: "Diego_9942" }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test src/ocr/seed.test.ts
```

Expected: FAIL — `Cannot find module './seed'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/ocr/seed.ts`:

```typescript
import type { PlacedShot } from "../screenshots";
import type { Player } from "../types";
import type { ShotRead } from "./read";

/**
 * The roster a test run should adopt, or `undefined` to leave the file alone. Nobody registered is
 * the whole condition: on game day the roster is typed in, so this never comes true.
 */
export function seededRoster(
  players: Player[],
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
): Player[] | undefined {
  const board = shots.find(
    (shot) =>
      shot.showIndex === 0 &&
      shot.roundIndex === 0 &&
      reads[shot.file]?.screen === "grid" &&
      (reads[shot.file]?.tokens.length ?? 0) > 0,
  );
  if (!board) return undefined;

  return [...players, ...reads[board.file]!.tokens.map((ingame) => ({ ingame }))];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test src/ocr/seed.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/seed.ts src/ocr/seed.test.ts
git commit -m "feat: read a test run's roster off its first qualification board"
```

---

### Task 2: A registered roster is left alone

**Files:**
- Modify: `src/ocr/seed.ts`
- Test: `src/ocr/seed.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/ocr/seed.test.ts`:

```typescript
test("one registered player is enough to leave the roster alone", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([{ ingame: "BigMooseLips" }], shots, reads)).toBeUndefined();
});

test("a player who registered and then withdrew still counts as a roster", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([{ ingame: "BigMooseLips", joined: false }], shots, reads)).toBeUndefined();
});

test("a row still being typed in is not a registered player", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([ADMIN, { ingame: "" }], shots, reads)).toEqual([
    ADMIN,
    { ingame: "" },
    { ingame: "Diego_9942" },
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/ocr/seed.test.ts
```

Expected: FAIL on "one registered player is enough" — got an array, expected `undefined`.

- [ ] **Step 3: Add the bare check**

In `src/ocr/seed.ts`, insert at the top of `seededRoster`, before the `shots.find`:

```typescript
  const registered = players.some((player) => !player.admin && player.ingame);
  if (registered) return undefined;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/ocr/seed.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/seed.ts src/ocr/seed.test.ts
git commit -m "feat: leave a roster that already has players alone"
```

---

### Task 3: No first board means no seed

**Files:**
- Modify: `src/ocr/seed.ts`
- Test: `src/ocr/seed.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/ocr/seed.test.ts`:

```typescript
test("a board off a later round is not the first board", () => {
  const shots = [shot("g.jpg", { roundIndex: 2 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("a board off a later show is not the first board", () => {
  const shots = [shot("g.jpg", { showIndex: 1 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("the board before it settles names everyone still in, so it is not read", () => {
  const shots = [shot("f.jpg")];
  const reads: Record<string, ShotRead> = { "f.jpg": { screen: "field", tokens: ["Diego_9942"] } };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("a capture nobody has read yet seeds nothing", () => {
  expect(seededRoster([], [shot("g.jpg")], {})).toBeUndefined();
});

test("a board that read no names seeds nothing", () => {
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: [] } };
  expect(seededRoster([], [shot("g.jpg")], reads)).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
bun test src/ocr/seed.test.ts
```

Expected: PASS, 10 tests. The `shots.find` predicate written in Task 1 already covers all five; this
task pins the behaviour down so a later change cannot lose it.

If any fail, the predicate is wrong — fix `src/ocr/seed.ts` rather than the test.

- [ ] **Step 3: Commit**

```bash
git add src/ocr/seed.test.ts
git commit -m "test: pin down which capture the roster may be read off"
```

---

### Task 4: The fullest read of the board wins

**Files:**
- Modify: `src/ocr/seed.ts`
- Test: `src/ocr/seed.test.ts`

Several captures land on the same board — a burst, or a re-read. One caught mid-settle has fewer
green cards than one caught after, so the fullest read is the one closest to the real lobby.

- [ ] **Step 1: Write the failing tests**

Append to `src/ocr/seed.test.ts`:

```typescript
test("two captures of the same board give the roster the fuller read", () => {
  const shots = [shot("early.jpg", { takenAt: 10 }), shot("late.jpg", { takenAt: 20 })];
  const reads: Record<string, ShotRead> = {
    "early.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9", "BigMooseLips"] },
    "late.jpg": { screen: "grid", tokens: ["Diego_9942"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([
    { ingame: "Diego_9942" },
    { ingame: "Serxav_9" },
    { ingame: "BigMooseLips" },
  ]);
});

test("two reads of the same size go with the later capture", () => {
  const shots = [shot("early.jpg", { takenAt: 10 }), shot("late.jpg", { takenAt: 20 })];
  const reads: Record<string, ShotRead> = {
    "early.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "late.jpg": { screen: "grid", tokens: ["Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([{ ingame: "Serxav_9" }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/ocr/seed.test.ts
```

Expected: FAIL on both — `find` returns `early.jpg` in the first (right answer, wrong reason: it is
first, not fullest) and in the second (wrong answer). Confirm the second test fails; the first may
already pass.

- [ ] **Step 3: Replace `find` with a sort**

In `src/ocr/seed.ts`, replace the `const board = shots.find(...)` statement with:

```typescript
  const boards = shots.filter(
    (shot) =>
      shot.showIndex === 0 &&
      shot.roundIndex === 0 &&
      reads[shot.file]?.screen === "grid" &&
      (reads[shot.file]?.tokens.length ?? 0) > 0,
  );
  // A capture caught before the plate settles has fewer cards green than one caught after it.
  const board = boards.sort(
    (a, b) => reads[b.file]!.tokens.length - reads[a.file]!.tokens.length || b.takenAt - a.takenAt,
  )[0];
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/ocr/seed.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/seed.ts src/ocr/seed.test.ts
git commit -m "feat: seed off the fullest read of the first board"
```

---

### Task 5: A name already on the roster is not added twice

**Files:**
- Modify: `src/ocr/seed.ts`
- Test: `src/ocr/seed.test.ts`

The admin plays under an `ingame` name and is on the board like everybody else, so their name comes
back off it.

- [ ] **Step 1: Write the failing tests**

Append to `src/ocr/seed.test.ts`:

```typescript
test("the admin read off the board keeps their own row rather than gaining a second", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["AnotherAccount58", "Diego_9942"] },
  };
  expect(seededRoster([ADMIN], shots, reads)).toEqual([ADMIN, { ingame: "Diego_9942" }]);
});

test("a board that read one name twice seeds it once", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Diego_9942"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([{ ingame: "Diego_9942" }]);
});

test("a board holding nobody new leaves the roster alone", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["AnotherAccount58"] },
  };
  expect(seededRoster([ADMIN], shots, reads)).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/ocr/seed.test.ts
```

Expected: FAIL on all three — duplicate rows come back, and the third returns an array.

- [ ] **Step 3: Skip the names already there**

In `src/ocr/seed.ts`, replace the `return [...players, ...]` statement with:

```typescript
  const known = new Set(players.map((player) => player.ingame));
  const fresh: Player[] = [];
  for (const ingame of reads[board.file]!.tokens) {
    if (known.has(ingame)) continue;
    known.add(ingame);
    fresh.push({ ingame });
  }
  return fresh.length === 0 ? undefined : [...players, ...fresh];
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/ocr/seed.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Run the whole suite**

```bash
bun test
```

Expected: PASS. Nothing outside `src/ocr/seed.*` has changed yet.

- [ ] **Step 6: Commit**

```bash
git add src/ocr/seed.ts src/ocr/seed.test.ts
git commit -m "feat: keep a name the roster already holds off the seed"
```

---

### Task 6: The server writes the seeded roster

**Files:**
- Modify: `scripts/serve.ts` (imports near line 14; `/api/state` handler at lines 462-466)

- [ ] **Step 1: Add the import**

`src/ocr/autofill` is already imported at `scripts/serve.ts:14`. Add beside it:

```typescript
import { seededRoster } from "../src/ocr/seed";
```

- [ ] **Step 2: Seed before the fills are computed**

In the `/api/state` handler, replace these lines (currently 462-466):

```typescript
      const players = (await Bun.file(PLAYERS_PATH).json()) as Players;
      const roster = players.players.flatMap((player) =>
        player.ingame && player.joined !== false ? [player.ingame] : [],
      );
      const fills = fillsFor(shots, readsFor(shots), roster, times, event.shows);
```

with:

```typescript
      const players = (await Bun.file(PLAYERS_PATH).json()) as Players;
      const seeded = seededRoster(players.players, shots, readsFor(shots));
      if (seeded) {
        players.players = seeded;
        await Bun.write(PLAYERS_PATH, `${JSON.stringify(players, null, 2)}\n`);
        transcript.write({
          kind: "entry",
          at: Date.now(),
          lane: "admin",
          text: `roster · nobody was registered, so ${seeded.length} players were read off the first board`,
        });
      }
      const roster = players.players.flatMap((player) =>
        player.ingame && player.joined !== false ? [player.ingame] : [],
      );
      const fills = fillsFor(shots, readsFor(shots), roster, times, event.shows);
```

The write goes through `Bun.write` rather than `writeJson`, which publishes: publishing commits the
whole of `data/` and pushes, and a GET must not. The seeded file rides along on the next admin save.

- [ ] **Step 3: Check it compiles and the suite still passes**

```bash
bun run typecheck && bun test
```

Expected: no TypeScript output, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/serve.ts
git commit -m "feat: adopt the roster read off the first board on a test run"
```

---

### Task 7: Try it against a real capture set

**Files:** none — a manual check.

- [ ] **Step 1: Put the current roster aside**

```bash
cp data/players.json /tmp/players.json.bak
jq '{players: [.players[] | select(.admin == true)]}' data/players.json > /tmp/bare.json
cp /tmp/bare.json data/players.json
```

- [ ] **Step 2: Start the server**

```bash
bun run dev
```

- [ ] **Step 3: Open the admin and watch for the line**

Open the admin URL the server printed. Expected in the terminal, once the first board has been read:

```
roster · nobody was registered, so N players were read off the first board
```

- [ ] **Step 4: Check what landed**

```bash
cat data/players.json
```

Expected: the admin row, then one `{ "ingame": "..." }` per name off the first show's round-1 board.
The admin should appear once, not twice.

- [ ] **Step 5: Check it does not fire twice**

Reload the admin. Expected: no second transcript line, and `data/players.json` unchanged.

- [ ] **Step 6: Put the real roster back**

```bash
cp /tmp/players.json.bak data/players.json
git status --short data/players.json
```

Expected: no output — the file matches what is committed.
