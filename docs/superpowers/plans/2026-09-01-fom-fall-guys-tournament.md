# FOM Fall Guys Tournament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rules document for the FOM board, an admin CLI that records Fall Guys round results into committed JSON, and a GitHub Pages leaderboard that renders them.

**Architecture:** A pure scoring function (`src/scoring.ts`) holds all tournament rules and never touches disk. Pure mutation/validation helpers (`src/event.ts`) guard the shape of the event data. A thin CLI (`src/cli.ts`) prompts the admin, calls those two, writes `data/event.json` and commits. The site reuses the same scoring function in the browser, so the leaderboard cannot drift from the CLI.

**Tech Stack:** Bun 1.3, TypeScript, `bun test`, `bun build`. No runtime dependencies.

Spec: `docs/superpowers/specs/2026-09-01-fom-fall-guys-tournament-design.md`

---

## File Structure

| File | Responsibility |
|-----------------------------|----------------|
| `docs/rules.md`             | The rules document handed to the FOM board. |
| `data/players.json`         | In-game name → FOM name → Discord handle. |
| `data/event.json`           | Shows, rounds and penalties. Appended to during the event. |
| `src/types.ts`              | Shared type definitions. No logic. |
| `src/scoring.ts`            | Pure `score(event, players) => LeaderboardRow[]`. All scoring rules live here. |
| `src/event.ts`              | Pure mutations and validation on an `Event` object. |
| `src/storage.ts`            | Reading and writing the two JSON files. |
| `src/cli.ts`                | Prompts, dispatch, git commit. No rules logic. |
| `site/render.ts`            | Pure `renderLeaderboard(rows) => string`. |
| `site/main.ts`              | Fetches JSON, calls scoring + render, injects into the DOM. |
| `site/index.html`           | Page shell. |
| `site/styles.css`           | Styling. |
| `scripts/build.ts`          | Bundles `site/` and `data/` into `dist/`. |
| `scripts/serve.ts`          | Local preview server for `dist/`. |
| `.github/workflows/pages.yml` | Builds and publishes `dist/` to GitHub Pages. |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fom-fallguys-tournament",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "cli": "bun run src/cli.ts",
    "build": "bun run scripts/build.ts",
    "dev": "bun run scripts/serve.ts"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 4: Verify Bun runs**

Run: `bun test`
Expected: exits reporting 0 tests found (no test files yet). Not an error.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore
git commit -m "chore: scaffold bun typescript project"
```

---

## Task 2: Rules document

The first deliverable, and independent of all code. Written in English, roughly two pages, adapted from `docs/The SquadGoals Honourable International Tournament.md`.

**Files:**
- Create: `docs/rules.md`

- [ ] **Step 1: Write `docs/rules.md`**

```markdown
# FOM Fall Guys Tournament — Rules

## 1. Registration

Post your in-game Fall Guys name in the tournament Discord channel before the event
starts, so it can be linked to your FOM name. Players whose in-game name has not been
registered cannot be scored.

## 2. Format

2.1 The tournament is played as a solo custom lobby. Everybody plays at the same time,
and each show runs to completion.

2.2 One admin runs the event. The admin does not compete: they eliminate themselves as
soon as possible at the start of each show and spectate, recording results and watching
for rule breaches.

2.3 The admin shares the lobby code in the tournament Discord channel. That code is for
FOM attendees only.

2.4 The admin chooses which shows to play, picking whatever suits the number of players
present, and decides when the tournament ends.

## 3. Scoring

3.1 Points are awarded per round:

| Achievement                           | Points |
|---------------------------------------|--------|
| First across the line in a race round | 3      |
| Qualifying for a show's final round   | 1      |
| Winning the final                     | 5      |

3.2 Rounds that are neither races nor finals — survival, hunt and logic rounds — award
no points.

3.3 Reaching the final and winning it are cumulative, so winning a show is worth 6
points in total.

3.4 If several players win a final at the same moment — a simultaneous crown grab, or a
"0 players remaining" screen — the 5 points are divided between them and rounded down.
Two winners receive 2 points each; three receive 1 point each.

3.5 The winner of the tournament is the player with the most points across every show
played. Standings are published on the tournament leaderboard page and updated after
each show.

## 4. Conduct

4.1 This is a solo tournament. Every player competes for themselves.

4.2 The admin may penalise obvious collaboration between players. Penalties are at the
admin's discretion, and may be a warning, a deduction of any number of points, or
exclusion from some or all of the remaining shows.

## 5. Tiebreaker

5.1 If two or more players are tied for first place at the end of the event, they play
one additional show. Whoever wins it takes first place.

5.2 If fewer players are tied than the show needs in order to start, the admin or other
attendees join to fill the lobby and eliminate themselves as soon as the show begins.

## 6. Admin's Authority

In any situation this document does not cover, the admin decides. Players may show the
admin factual evidence if they believe a decision is wrong, but there is no right of
protest.
```

- [ ] **Step 2: Check the rendered length**

Run: `wc -w docs/rules.md`
Expected: roughly 450–550 words, which is about two pages.

- [ ] **Step 3: Commit**

```bash
git add docs/rules.md
git commit -m "docs: add FOM Fall Guys tournament rules"
```

---

## Task 3: Types and seed data

**Files:**
- Create: `src/types.ts`, `data/players.json`, `data/event.json`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export type RoundType = "race" | "survival" | "final";

export interface Round {
  map: string;
  type: RoundType;
  /** In-game name of the player who crossed first. Race rounds only. */
  first?: string;
}

export interface Show {
  name: string;
  /** In-game names of everyone who qualified for the final round. */
  finalists?: string[];
  /** In-game names of the final's winners. More than one means a simultaneous win. */
  winners?: string[];
  rounds: Round[];
}

export interface Penalty {
  ingame: string;
  points: number;
  reason: string;
}

export interface TournamentEvent {
  name: string;
  date: string;
  shows: Show[];
  penalties: Penalty[];
}

export interface Player {
  ingame: string;
  fom: string;
  discord?: string;
}

export interface Players {
  players: Player[];
}

export interface LeaderboardRow {
  ingame: string;
  fom: string;
  points: number;
  raceWins: number;
  finalsReached: number;
  finalsWon: number;
  penaltyPoints: number;
}
```

- [ ] **Step 2: Create `data/players.json`**

```json
{
  "players": [
    { "ingame": "SuperFall99", "fom": "Wouter", "discord": "wouterv" }
  ]
}
```

- [ ] **Step 3: Create `data/event.json`**

```json
{
  "name": "FOM 2026",
  "date": "2026-09-01",
  "shows": [],
  "penalties": []
}
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts data/players.json data/event.json
git commit -m "feat: add tournament types and seed data files"
```

---

## Task 4: Scoring — race wins

The scoring function is built up over Tasks 4–7, one rule at a time. Every registered
player gets a row, including those who scored nothing, so the leaderboard shows the
whole field.

**Files:**
- Create: `src/scoring.ts`, `src/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scoring.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { score } from "./scoring";
import type { Players, TournamentEvent } from "./types";

export const players: Players = {
  players: [
    { ingame: "Alpha", fom: "Ann" },
    { ingame: "Bravo", fom: "Bob" },
    { ingame: "Charlie", fom: "Cas" },
  ],
};

export function emptyEvent(): TournamentEvent {
  return { name: "FOM", date: "2026-09-01", shows: [], penalties: [] };
}

export function pointsFor(rows: ReturnType<typeof score>, ingame: string): number {
  const row = rows.find((r) => r.ingame === ingame);
  if (!row) throw new Error(`no row for ${ingame}`);
  return row.points;
}

test("every registered player gets a row, even with no results", () => {
  const rows = score(emptyEvent(), players);
  expect(rows.map((r) => r.ingame).sort()).toEqual(["Alpha", "Bravo", "Charlie"]);
  expect(rows.every((r) => r.points === 0)).toBe(true);
});

test("winning a race round awards 3 points", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", first: "Alpha" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(3);
  expect(pointsFor(rows, "Bravo")).toBe(0);
});

test("race wins accumulate across shows", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Alpha" },
      { map: "Hoopsie Legends", type: "survival" },
    ],
  });
  event.shows.push({
    name: "Solos",
    rounds: [{ map: "Slime Climb", type: "race", first: "Alpha" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(6);
  expect(rows.find((r) => r.ingame === "Alpha")!.raceWins).toBe(2);
});

test("survival rounds award nothing", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    rounds: [{ map: "Hoopsie Legends", type: "survival" }],
  });
  const rows = score(event, players);
  expect(rows.every((r) => r.points === 0)).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/scoring.test.ts`
Expected: FAIL — cannot resolve module `./scoring`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/scoring.ts`:

```typescript
import type { LeaderboardRow, Players, TournamentEvent } from "./types";

export const RACE_WIN = 3;

export function score(event: TournamentEvent, players: Players): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();
  for (const player of players.players) {
    rows.set(player.ingame, {
      ingame: player.ingame,
      fom: player.fom,
      points: 0,
      raceWins: 0,
      finalsReached: 0,
      finalsWon: 0,
      penaltyPoints: 0,
    });
  }

  for (const show of event.shows) {
    for (const round of show.rounds) {
      if (round.type !== "race" || !round.first) continue;
      const row = rows.get(round.first);
      if (!row) continue;
      row.raceWins += 1;
      row.points += RACE_WIN;
    }
  }

  return [...rows.values()];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/scoring.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scoring.ts src/scoring.test.ts
git commit -m "feat: award points for race round wins"
```

---

## Task 5: Scoring — finals

**Files:**
- Modify: `src/scoring.ts`
- Modify: `src/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/scoring.test.ts`:

```typescript
test("qualifying for the final awards 1 point", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    finalists: ["Alpha", "Bravo"],
    winners: [],
    rounds: [{ map: "Fall Mountain", type: "final" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(1);
  expect(pointsFor(rows, "Bravo")).toBe(1);
  expect(pointsFor(rows, "Charlie")).toBe(0);
});

test("winning the final is worth 6 in total, reaching it included", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    finalists: ["Alpha", "Bravo"],
    winners: ["Alpha"],
    rounds: [{ map: "Fall Mountain", type: "final" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(6);
  expect(pointsFor(rows, "Bravo")).toBe(1);
});

test("two simultaneous winners split the 5 into 2 each", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    finalists: ["Alpha", "Bravo"],
    winners: ["Alpha", "Bravo"],
    rounds: [{ map: "Fall Mountain", type: "final" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(3);
  expect(pointsFor(rows, "Bravo")).toBe(3);
});

test("three simultaneous winners split the 5 into 1 each, rounded down", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    finalists: ["Alpha", "Bravo", "Charlie"],
    winners: ["Alpha", "Bravo", "Charlie"],
    rounds: [{ map: "Fall Mountain", type: "final" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(2);
  expect(pointsFor(rows, "Bravo")).toBe(2);
  expect(pointsFor(rows, "Charlie")).toBe(2);
});

test("a race that is the final scores as a final only", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    finalists: ["Alpha"],
    winners: ["Alpha"],
    rounds: [{ map: "Lily Leapers", type: "final", first: "Alpha" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(6);
  expect(rows.find((r) => r.ingame === "Alpha")!.raceWins).toBe(0);
});

test("a show with no final recorded yet scores only its race rounds", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", first: "Alpha" }],
  });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/scoring.test.ts`
Expected: FAIL — the final tests report 0 where 1, 3, 2 or 6 was expected.

- [ ] **Step 3: Write the implementation**

In `src/scoring.ts`, add the two constants beside `RACE_WIN`:

```typescript
export const RACE_WIN = 3;
export const REACHED_FINAL = 1;
export const FINAL_WIN = 5;
```

Then inside the `for (const show of event.shows)` loop, after the rounds loop, add:

```typescript
    for (const ingame of show.finalists ?? []) {
      const row = rows.get(ingame);
      if (!row) continue;
      row.finalsReached += 1;
      row.points += REACHED_FINAL;
    }

    const winners = show.winners ?? [];
    if (winners.length > 0) {
      const share = Math.floor(FINAL_WIN / winners.length);
      for (const ingame of winners) {
        const row = rows.get(ingame);
        if (!row) continue;
        row.finalsWon += 1;
        row.points += share;
      }
    }
```

The existing rounds loop already skips anything whose `type` is not `"race"`, so a
final that is also a race scores as a final only, with no change needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/scoring.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scoring.ts src/scoring.test.ts
git commit -m "feat: award points for reaching and winning finals"
```

---

## Task 6: Scoring — penalties and unregistered names

The CLI rejects unregistered names at entry, but `score` must not crash on hand-edited
JSON, so it silently ignores names it does not know.

**Files:**
- Modify: `src/scoring.ts`
- Modify: `src/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/scoring.test.ts`:

```typescript
test("a penalty subtracts from a player's total", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", first: "Alpha" }],
  });
  event.penalties.push({ ingame: "Alpha", points: -2, reason: "collaboration" });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(1);
  expect(rows.find((r) => r.ingame === "Alpha")!.penaltyPoints).toBe(-2);
});

test("penalties can push a total below zero", () => {
  const event = emptyEvent();
  event.penalties.push({ ingame: "Alpha", points: -4, reason: "collaboration" });
  const rows = score(event, players);
  expect(pointsFor(rows, "Alpha")).toBe(-4);
});

test("results for unregistered in-game names are ignored", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    finalists: ["Ghost", "Alpha"],
    winners: ["Ghost"],
    rounds: [{ map: "Dizzy Heights", type: "race", first: "Ghost" }],
  });
  event.penalties.push({ ingame: "Ghost", points: -2, reason: "collaboration" });
  const rows = score(event, players);
  expect(rows.map((r) => r.ingame).sort()).toEqual(["Alpha", "Bravo", "Charlie"]);
  expect(pointsFor(rows, "Alpha")).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/scoring.test.ts`
Expected: FAIL — the two penalty tests report 3 and 0 instead of 1 and -4.

- [ ] **Step 3: Write the implementation**

In `src/scoring.ts`, between the shows loop and the `return`, add:

```typescript
  for (const penalty of event.penalties) {
    const row = rows.get(penalty.ingame);
    if (!row) continue;
    row.penaltyPoints += penalty.points;
    row.points += penalty.points;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/scoring.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scoring.ts src/scoring.test.ts
git commit -m "feat: apply admin penalties to the leaderboard"
```

---

## Task 7: Scoring — leaderboard ordering

**Files:**
- Modify: `src/scoring.ts`
- Modify: `src/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/scoring.test.ts`:

```typescript
test("rows are ordered by points, highest first", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Charlie" },
      { map: "Slime Climb", type: "race", first: "Charlie" },
      { map: "Tip Toe", type: "race", first: "Bravo" },
    ],
  });
  const rows = score(event, players);
  expect(rows.map((r) => r.ingame)).toEqual(["Charlie", "Bravo", "Alpha"]);
});

test("equal points are broken by finals won, then finals reached, then race wins", () => {
  // Alpha takes 2 race wins (6). Bravo reaches and wins one final (6). Charlie takes a
  // race win and reaches the final in two shows (8), so leads outright.
  const event = emptyEvent();
  event.shows.push({
    name: "One",
    finalists: ["Bravo"],
    winners: ["Bravo"],
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Alpha" },
      { map: "Slime Climb", type: "race", first: "Alpha" },
      { map: "Fall Mountain", type: "final" },
    ],
  });
  event.shows.push({
    name: "Two",
    finalists: ["Charlie"],
    winners: [],
    rounds: [
      { map: "Tip Toe", type: "race", first: "Charlie" },
      { map: "Hex-A-Gone", type: "final" },
    ],
  });
  event.shows.push({
    name: "Three",
    finalists: ["Charlie"],
    winners: [],
    rounds: [
      { map: "Whirlygig", type: "race", first: "Charlie" },
      { map: "Hex-A-Gone", type: "final" },
    ],
  });
  const rows = score(event, players);
  expect(rows.map((r) => r.points)).toEqual([8, 6, 6]);
  // Charlie leads on 8. Bravo and Alpha tie on 6; Bravo wins the tiebreak on finals won.
  expect(rows.map((r) => r.ingame)).toEqual(["Charlie", "Bravo", "Alpha"]);
});

test("players level on every criterion are ordered by in-game name", () => {
  const rows = score(emptyEvent(), players);
  expect(rows.map((r) => r.ingame)).toEqual(["Alpha", "Bravo", "Charlie"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/scoring.test.ts`
Expected: FAIL — rows come back in registration order, not point order.

- [ ] **Step 3: Write the implementation**

In `src/scoring.ts`, change the return to sort, and add the comparator below `score`:

```typescript
  return [...rows.values()].sort(compareRows);
}

function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  return (
    b.points - a.points ||
    b.finalsWon - a.finalsWon ||
    b.finalsReached - a.finalsReached ||
    b.raceWins - a.raceWins ||
    a.ingame.localeCompare(b.ingame)
  );
}
```

- [ ] **Step 4: Run the whole suite**

Run: `bun test`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scoring.ts src/scoring.test.ts
git commit -m "feat: order the leaderboard by points and tiebreakers"
```

---

## Task 8: Event mutations and validation

Everything the CLI is allowed to do to an `Event`, with the validation attached, kept
pure so it can be tested without touching disk or git.

**Files:**
- Create: `src/event.ts`, `src/event.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/event.test.ts`:

```typescript
import { expect, test } from "bun:test";
import {
  addPenalty,
  addRound,
  addShow,
  closeShow,
  currentShow,
  resolvePlayer,
  ValidationError,
} from "./event";
import type { Players, TournamentEvent } from "./types";

const players: Players = {
  players: [
    { ingame: "Alpha", fom: "Ann" },
    { ingame: "Bravo", fom: "Bob" },
  ],
};

function emptyEvent(): TournamentEvent {
  return { name: "FOM", date: "2026-09-01", shows: [], penalties: [] };
}

test("resolvePlayer matches an in-game name case-insensitively", () => {
  expect(resolvePlayer(players, "alpha")).toBe("Alpha");
  expect(resolvePlayer(players, "  Alpha ")).toBe("Alpha");
});

test("resolvePlayer rejects an unknown name and suggests near matches", () => {
  expect(() => resolvePlayer(players, "Alp")).toThrow(ValidationError);
  expect(() => resolvePlayer(players, "Alp")).toThrow(/Alpha/);
});

test("currentShow rejects recording anything before a show is started", () => {
  expect(() => currentShow(emptyEvent())).toThrow(ValidationError);
});

test("addShow appends a show and makes it current", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  expect(event.shows).toHaveLength(1);
  expect(currentShow(event).name).toBe("Solos");
});

test("addRound appends to the current show", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Dizzy Heights", type: "race", first: "Alpha" });
  expect(currentShow(event).rounds).toEqual([
    { map: "Dizzy Heights", type: "race", first: "Alpha" },
  ]);
});

test("closeShow records the final round, its finalists and its winners", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  closeShow(event, {
    map: "Fall Mountain",
    finalists: ["Alpha", "Bravo"],
    winners: ["Alpha"],
  });
  const show = currentShow(event);
  expect(show.rounds).toEqual([{ map: "Fall Mountain", type: "final" }]);
  expect(show.finalists).toEqual(["Alpha", "Bravo"]);
  expect(show.winners).toEqual(["Alpha"]);
});

test("closeShow accepts an empty winners list for a timed-out final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  closeShow(event, { map: "Hex-A-Gone", finalists: ["Alpha"], winners: [] });
  expect(currentShow(event).winners).toEqual([]);
});

test("closeShow rejects a winner who did not reach the final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  expect(() =>
    closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Bravo"] }),
  ).toThrow(ValidationError);
});

test("closeShow rejects a show that is already closed", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] });
  expect(() =>
    closeShow(event, { map: "Hex-A-Gone", finalists: ["Bravo"], winners: ["Bravo"] }),
  ).toThrow(ValidationError);
});

test("addRound rejects a show that is already closed", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] });
  expect(() => addRound(event, { map: "Tip Toe", type: "race", first: "Alpha" })).toThrow(
    ValidationError,
  );
});

test("addPenalty appends to the event", () => {
  const event = emptyEvent();
  addPenalty(event, { ingame: "Alpha", points: -2, reason: "collaboration" });
  expect(event.penalties).toEqual([
    { ingame: "Alpha", points: -2, reason: "collaboration" },
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/event.test.ts`
Expected: FAIL — cannot resolve module `./event`.

- [ ] **Step 3: Write the implementation**

Create `src/event.ts`:

```typescript
import type { Penalty, Players, Round, Show, TournamentEvent } from "./types";

export class ValidationError extends Error {}

export function resolvePlayer(players: Players, name: string): string {
  const target = name.trim().toLowerCase();
  const exact = players.players.find((p) => p.ingame.toLowerCase() === target);
  if (exact) return exact.ingame;

  const known = players.players.map((p) => p.ingame);
  const near = known.filter(
    (n) => n.toLowerCase().includes(target) || target.includes(n.toLowerCase()),
  );
  const suggestions = near.length > 0 ? near : known;
  throw new ValidationError(
    `Unknown in-game name "${name}". Registered: ${suggestions.join(", ")}`,
  );
}

export function currentShow(event: TournamentEvent): Show {
  const show = event.shows.at(-1);
  if (!show) throw new ValidationError("No show started yet. Run `bun run cli show` first.");
  return show;
}

function isClosed(show: Show): boolean {
  return show.rounds.some((round) => round.type === "final");
}

export function addShow(event: TournamentEvent, name: string): Show {
  const show: Show = { name, rounds: [] };
  event.shows.push(show);
  return show;
}

export function addRound(event: TournamentEvent, round: Round): void {
  const show = currentShow(event);
  if (isClosed(show)) {
    throw new ValidationError(
      `Show "${show.name}" is already closed. Start a new show first.`,
    );
  }
  show.rounds.push(round);
}

export function closeShow(
  event: TournamentEvent,
  final: { map: string; finalists: string[]; winners: string[] },
): void {
  const show = currentShow(event);
  if (isClosed(show)) {
    throw new ValidationError(`Show "${show.name}" is already closed.`);
  }
  const notFinalists = final.winners.filter((w) => !final.finalists.includes(w));
  if (notFinalists.length > 0) {
    throw new ValidationError(
      `Winners must have reached the final: ${notFinalists.join(", ")} did not.`,
    );
  }
  show.finalists = final.finalists;
  show.winners = final.winners;
  show.rounds.push({ map: final.map, type: "final" });
}

export function addPenalty(event: TournamentEvent, penalty: Penalty): void {
  event.penalties.push(penalty);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: PASS, 27 tests.

- [ ] **Step 5: Commit**

```bash
git add src/event.ts src/event.test.ts
git commit -m "feat: add event mutations with validation"
```

---

## Task 9: Storage and admin CLI

**Files:**
- Create: `src/storage.ts`, `src/storage.test.ts`, `src/cli.ts`

- [ ] **Step 1: Write the failing storage test**

Create `src/storage.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEvent, loadPlayers, saveEvent } from "./storage";
import type { TournamentEvent } from "./types";

test("an event survives a save and load round trip", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fom-"));
  const path = join(dir, "event.json");
  const event: TournamentEvent = {
    name: "FOM",
    date: "2026-09-01",
    shows: [{ name: "Solos", rounds: [{ map: "Tip Toe", type: "race", first: "Alpha" }] }],
    penalties: [],
  };
  await saveEvent(event, path);
  expect(await loadEvent(path)).toEqual(event);
});

test("the committed data files parse", async () => {
  expect((await loadPlayers()).players.length).toBeGreaterThan(0);
  expect(Array.isArray((await loadEvent()).shows)).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/storage.test.ts`
Expected: FAIL — cannot resolve module `./storage`.

- [ ] **Step 3: Write `src/storage.ts`**

```typescript
import type { Players, TournamentEvent } from "./types";

export const EVENT_PATH = "data/event.json";
export const PLAYERS_PATH = "data/players.json";

export async function loadEvent(path: string = EVENT_PATH): Promise<TournamentEvent> {
  return (await Bun.file(path).json()) as TournamentEvent;
}

export async function saveEvent(
  event: TournamentEvent,
  path: string = EVENT_PATH,
): Promise<void> {
  await Bun.write(path, `${JSON.stringify(event, null, 2)}\n`);
}

export async function loadPlayers(path: string = PLAYERS_PATH): Promise<Players> {
  return (await Bun.file(path).json()) as Players;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/storage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write `src/cli.ts`**

The CLI has no rules logic of its own: it prompts, calls `src/event.ts` and
`src/scoring.ts`, saves, and commits. `git push` is attempted only when a remote exists,
and a failure there is reported without losing the commit.

```typescript
#!/usr/bin/env bun
import { $ } from "bun";
import {
  addPenalty,
  addRound,
  addShow,
  closeShow,
  currentShow,
  resolvePlayer,
  ValidationError,
} from "./event";
import { score } from "./scoring";
import { loadEvent, loadPlayers, saveEvent } from "./storage";
import type { Players, RoundType } from "./types";

function ask(question: string): string {
  const answer = prompt(question);
  if (answer === null) {
    console.log("Aborted.");
    process.exit(1);
  }
  return answer.trim();
}

function askRequired(question: string): string {
  const answer = ask(question);
  if (!answer) throw new ValidationError("A value is required.");
  return answer;
}

function askPlayers(question: string, players: Players): string[] {
  return ask(question)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => resolvePlayer(players, name));
}

async function commit(message: string, noCommit: boolean): Promise<void> {
  if (noCommit) {
    console.log("Saved without committing.");
    return;
  }
  await $`git add data/event.json`.quiet();
  await $`git commit -m ${message}`.quiet();
  const remotes = (await $`git remote`.text()).trim();
  if (!remotes) {
    console.log("Committed. No git remote configured, so nothing was pushed.");
    return;
  }
  try {
    await $`git push`.quiet();
    console.log("Committed and pushed.");
  } catch {
    console.log("Committed, but the push failed. Push manually when you have a connection.");
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noCommit = args.includes("--no-commit");
  const command = args.find((arg) => !arg.startsWith("--"));

  const players = await loadPlayers();
  const event = await loadEvent();

  switch (command) {
    case "show": {
      const name = askRequired("Show name: ");
      addShow(event, name);
      await saveEvent(event);
      await commit(`data: start show ${name}`, noCommit);
      break;
    }
    case "round": {
      const map = askRequired("Map: ");
      const type = ask("Type [race/survival] (default race): ") || "race";
      if (type !== "race" && type !== "survival") {
        throw new ValidationError(`Type must be race or survival, got "${type}".`);
      }
      const first =
        type === "race" ? resolvePlayer(players, askRequired("First across the line: ")) : undefined;
      addRound(event, { map, type: type as RoundType, ...(first ? { first } : {}) });
      await saveEvent(event);
      await commit(`data: record ${map}`, noCommit);
      break;
    }
    case "final": {
      const map = askRequired("Final map: ");
      const finalists = askPlayers("Finalists (comma separated): ", players);
      const winners = askPlayers("Winners (comma separated, blank if none): ", players);
      closeShow(event, { map, finalists, winners });
      await saveEvent(event);
      await commit(`data: close show ${currentShow(event).name}`, noCommit);
      break;
    }
    case "penalty": {
      const ingame = resolvePlayer(players, askRequired("Player: "));
      const points = Number(askRequired("Points (negative to deduct): "));
      if (!Number.isInteger(points)) {
        throw new ValidationError("Points must be a whole number.");
      }
      const reason = askRequired("Reason: ");
      addPenalty(event, { ingame, points, reason });
      await saveEvent(event);
      await commit(`data: penalise ${ingame} ${points}`, noCommit);
      break;
    }
    case "board": {
      console.table(
        score(event, players).map((row, index) => ({
          "#": index + 1,
          FOM: row.fom,
          "In-game": row.ingame,
          Points: row.points,
          Races: row.raceWins,
          Finals: row.finalsReached,
          Wins: row.finalsWon,
        })),
      );
      break;
    }
    default:
      console.log("Usage: bun run cli <show|round|final|penalty|board> [--no-commit]");
      process.exit(1);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
```

- [ ] **Step 6: Verify the CLI runs end to end**

```bash
bun run cli board
printf 'Solos\n' | bun run cli show --no-commit
printf 'Dizzy Heights\nrace\nSuperFall99\n' | bun run cli round --no-commit
bun run cli board
git checkout data/event.json
```

Expected: the first `board` prints one row on 0 points; the second prints the same
player on 3 points. `git checkout` discards the dry-run edits.

- [ ] **Step 7: Commit**

```bash
git add src/storage.ts src/storage.test.ts src/cli.ts
git commit -m "feat: add admin CLI for recording rounds and penalties"
```

---

## Task 10: Leaderboard rendering

Pure string rendering, so it can be tested without a browser. Players level on points
share a rank number.

**Files:**
- Create: `site/render.ts`, `site/render.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `site/render.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { renderLeaderboard } from "./render";
import type { LeaderboardRow } from "../src/types";

function row(overrides: Partial<LeaderboardRow>): LeaderboardRow {
  return {
    ingame: "Alpha",
    fom: "Ann",
    points: 0,
    raceWins: 0,
    finalsReached: 0,
    finalsWon: 0,
    penaltyPoints: 0,
    ...overrides,
  };
}

test("an empty field renders a message rather than a table", () => {
  expect(renderLeaderboard([])).toContain("No players registered");
});

test("each player renders with their FOM name, in-game name and points", () => {
  const html = renderLeaderboard([row({ fom: "Ann", ingame: "Alpha", points: 9 })]);
  expect(html).toContain("Ann");
  expect(html).toContain("Alpha");
  expect(html).toContain(">9<");
});

test("ranks count up in order", () => {
  const html = renderLeaderboard([
    row({ ingame: "Alpha", points: 9 }),
    row({ ingame: "Bravo", points: 4 }),
  ]);
  const ranks = [...html.matchAll(/class="rank">(\d+)</g)].map((m) => m[1]);
  expect(ranks).toEqual(["1", "2"]);
});

test("players level on points share a rank, and the next rank skips", () => {
  const html = renderLeaderboard([
    row({ ingame: "Alpha", points: 9 }),
    row({ ingame: "Bravo", points: 9 }),
    row({ ingame: "Charlie", points: 4 }),
  ]);
  const ranks = [...html.matchAll(/class="rank">(\d+)</g)].map((m) => m[1]);
  expect(ranks).toEqual(["1", "1", "3"]);
});

test("names are escaped", () => {
  const html = renderLeaderboard([row({ fom: "<script>", ingame: "A&B" })]);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("A&amp;B");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test site/render.test.ts`
Expected: FAIL — cannot resolve module `./render`.

- [ ] **Step 3: Write `site/render.ts`**

```typescript
import type { LeaderboardRow } from "../src/types";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ranks(rows: LeaderboardRow[]): number[] {
  const result: number[] = [];
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    result.push(previous && previous.points === row.points ? result[index - 1]! : index + 1);
  });
  return result;
}

export function renderLeaderboard(rows: LeaderboardRow[]): string {
  if (rows.length === 0) {
    return `<p class="empty">No players registered yet.</p>`;
  }

  const rank = ranks(rows);
  const body = rows
    .map(
      (row, index) => `
      <tr>
        <td class="rank">${rank[index]}</td>
        <td class="player">
          <span class="fom">${escapeHtml(row.fom)}</span>
          <span class="ingame">${escapeHtml(row.ingame)}</span>
        </td>
        <td class="points">${row.points}</td>
        <td>${row.raceWins}</td>
        <td>${row.finalsReached}</td>
        <td>${row.finalsWon}</td>
      </tr>`,
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Points</th>
          <th title="Race rounds won">Races</th>
          <th title="Finals reached">Finals</th>
          <th title="Finals won">Wins</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: PASS, 34 tests.

- [ ] **Step 5: Commit**

```bash
git add site/render.ts site/render.test.ts
git commit -m "feat: render the leaderboard table"
```

---

## Task 11: Site shell, build and preview server

**Files:**
- Create: `site/main.ts`, `site/index.html`, `site/styles.css`, `scripts/build.ts`, `scripts/serve.ts`

- [ ] **Step 1: Create `site/main.ts`**

```typescript
import { score } from "../src/scoring";
import type { Players, TournamentEvent } from "../src/types";
import { renderLeaderboard } from "./render";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const target = document.querySelector<HTMLElement>("#leaderboard");
  if (!target) return;

  try {
    const [event, players] = await Promise.all([
      fetchJson<TournamentEvent>("./event.json"),
      fetchJson<Players>("./players.json"),
    ]);
    document.querySelector<HTMLElement>("#event-name")!.textContent = event.name;
    document.querySelector<HTMLElement>("#show-count")!.textContent =
      `${event.shows.length} show${event.shows.length === 1 ? "" : "s"} played`;
    target.innerHTML = renderLeaderboard(score(event, players));
  } catch (error) {
    target.innerHTML = `<p class="empty">Could not load the standings: ${error}</p>`;
  }
}

void main();
```

- [ ] **Step 2: Create `site/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FOM Fall Guys Tournament</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <h1 id="event-name">FOM Fall Guys Tournament</h1>
      <p id="show-count" class="subtitle"></p>
      <div id="leaderboard"><p class="empty">Loading…</p></div>
    </main>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `site/styles.css`**

```css
:root {
  color-scheme: light dark;
  --bg: #12121a;
  --fg: #f2f2f7;
  --muted: #9a9ab0;
  --accent: #ffcf3f;
  --line: #2a2a3a;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 2rem 1rem;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.5 system-ui, sans-serif;
}

main { max-width: 46rem; margin: 0 auto; }

h1 { margin: 0; font-size: 1.75rem; }

.subtitle { margin: 0.25rem 0 2rem; color: var(--muted); }

table { width: 100%; border-collapse: collapse; }

th, td {
  padding: 0.6rem 0.5rem;
  text-align: right;
  border-bottom: 1px solid var(--line);
}

th:nth-child(2), td.player { text-align: left; }

th { font-size: 0.8rem; text-transform: uppercase; color: var(--muted); }

td.rank { width: 2.5rem; text-align: left; color: var(--muted); }

td.points { font-weight: 700; color: var(--accent); }

.fom { display: block; }

.ingame { display: block; font-size: 0.8rem; color: var(--muted); }

tbody tr:first-child td.rank,
tbody tr:first-child .fom { color: var(--accent); }

.empty { color: var(--muted); }

```

- [ ] **Step 4: Create `scripts/build.ts`**

```typescript
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
```

- [ ] **Step 5: Create `scripts/serve.ts`**

```typescript
const server = Bun.serve({
  port: 3000,
  fetch(request) {
    const path = new URL(request.url).pathname;
    const file = Bun.file(`dist${path === "/" ? "/index.html" : path}`);
    return new Response(file);
  },
});

console.log(`Serving dist/ on ${server.url}`);
```

- [ ] **Step 6: Build and verify the output**

```bash
bun run build
ls dist
```

Expected: `dist/` contains `main.js`, `index.html`, `styles.css`, `event.json` and
`players.json`.

- [ ] **Step 7: Verify the page renders real data**

```bash
bun run dev &
sleep 1
curl -s localhost:3000/ | grep -c leaderboard
curl -s localhost:3000/event.json | head -c 80
kill %1
```

Expected: the grep finds the `#leaderboard` element and the JSON is served. Then open
`http://localhost:3000` in a browser to confirm the table renders — this is the visual
check, and it is Wouter's to make.

- [ ] **Step 8: Commit**

```bash
git add site/main.ts site/index.html site/styles.css scripts/build.ts scripts/serve.ts
git commit -m "feat: add leaderboard page with build and preview server"
```

---

## Task 12: GitHub Pages workflow

Note there is currently no git remote on this repository. The workflow is committed
ready to run; it only takes effect once the repo is pushed to GitHub and Pages is set to
the "GitHub Actions" source in the repository settings.

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Create `.github/workflows/pages.yml`**

```yaml
name: Publish leaderboard

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun test
      - run: bun run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify the workflow parses**

Run: `bunx --bun js-yaml .github/workflows/pages.yml > /dev/null && echo ok`
Expected: `ok`. If `js-yaml` is unavailable offline, read the file and confirm the
indentation by eye instead.

- [ ] **Step 3: Confirm the whole suite still passes**

Run: `bun test`
Expected: PASS, 34 tests.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: publish the leaderboard to GitHub Pages"
```

---

## Follow-up, not in this plan

`Player.log` parsing (spec §7) is deliberately excluded. Wouter is looking for a real
log file. Once one exists, confirm whether it records placements for all lobby players
or only the local one, then plan a parser that proposes round results for the CLI to
confirm. Manual entry stays the fallback in either case.

The rules document is not published to the site — it goes to the FOM board as Markdown.
Putting it on the leaderboard page would mean rendering Markdown in the browser, which
costs a dependency for no benefit while the Discord channel already carries the rules.
