# Who Is Still In The Show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colour every registered player against the show being played — gold won, green through, grey still in, red out — on both `results.html` and `index.html`.

**Architecture:** Survivors move onto the round they were read after (`Round.qualified`), so `Show.finalists` becomes derivable and is deleted. A pure `src/field.ts` turns a show plus the roster into a list of coloured players; `site/show-field.ts` renders it, and both pages call it.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun run typecheck`). No framework — pages are template strings, the admin is hand-rolled DOM.

Spec: [docs/superpowers/specs/2026-09-02-live-show-field.md](../specs/2026-09-02-live-show-field.md)

**In-flight work:** `Show.checked` / `ShowDraft.checked` — a flag the admin ticks when a show has
been read back against its captures — is being added in parallel. Every function body quoted in
Tasks 3 and 7 is written against the version **without** it. Before pasting one, diff it against
what is actually in the file and carry any `checked` handling through; the spread lines look like
`...(draft.checked ? { checked: true } : {})`.

---

## File Structure

| File | Responsibility |
|-----------------------------|--------------------------------------------------------------|
| `src/types.ts`              | `Round.qualified` added, `Show.finalists` removed             |
| `src/rounds.ts`             | `finalistsOf(show)` |
| `src/field.ts`              | **new** — `fieldOf(show, players)`, the colour rules |
| `src/scoring.ts`            | reads `finalistsOf` |
| `src/event.ts`              | `closeShow` writes the semi's `qualified` |
| `src/data-check.ts`         | validates `rounds[].qualified`, stops validating `finalists` |
| `src/ocr/autofill.ts`       | every board fills `{ slot: "qualified", roundIndex }` |
| `site/show-field.ts`        | **new** — the chip grid, and the dashboard panel around it |
| `site/results.ts`           | show panels carry the grid |
| `site/main.ts`              | passes players through; dashboard panel above the podium |
| `site/admin-model.ts`       | `RoundDraft.qualified` replaces `ShowDraft.finalists` |
| `site/admin.ts`             | per-round **Qualified** block replaces the Finalists block |
| `site/styles.css`           | chip styles |
| `data/event.json`           | drops `finalists` |
| `README.md`                 | OCR table, page table |

Tasks 1–5 land the model and both pages. Tasks 6–7 land the OCR and admin so per-round
survivors can actually be filled and corrected. Task 8 is docs.

---

### Task 1: `Round.qualified` and `finalistsOf`

Purely additive — nothing else changes yet, so the build stays green.

**Files:**
- Modify: `src/types.ts:11-18`
- Modify: `src/rounds.ts` (append)
- Test: `src/rounds.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/rounds.test.ts`:

```ts
test("finalistsOf reads the board after the round before the final", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final" },
    ],
  };
  expect(finalistsOf(show)).toEqual(["Alpha", "Bravo"]);
});

test("a show whose final has not been played yet has no finalists", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
    ],
  };
  expect(finalistsOf(show)).toEqual([]);
});

test("finalistsOf gives nothing when the semi's board was never read", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Roll Out", type: "survival" },
      { map: "Fall Mountain", type: "final" },
    ],
  };
  expect(finalistsOf(show)).toEqual([]);
});

test("a show that is only a final has no round to hang finalists off", () => {
  const show: Show = { name: "Solos", rounds: [{ map: "Fall Mountain", type: "final" }] };
  expect(finalistsOf(show)).toEqual([]);
});
```

Extend the file's existing imports to cover the new names:

```ts
import { finalistsOf } from "./rounds";
import type { Show } from "./types";
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test src/rounds.test.ts`
Expected: FAIL — `finalistsOf` is not exported from `./rounds`.

- [ ] **Step 3: Add `qualified` to the round**

In `src/types.ts`, replace the `Round` interface:

```ts
export interface Round {
  map: string;
  type: RoundType;
  /** In-game name of the player who crossed first. Race rounds only. */
  first?: string;
  /** In-game names off the qualification board that came up after this round. */
  qualified?: string[];
}
```

- [ ] **Step 4: Add `finalistsOf`**

Append to `src/rounds.ts`:

```ts
/**
 * Rounds arrive one at a time as they are played, so a show three rounds in has a second-to-last
 * round that is nobody's semi-final. Until the final itself is on the list there are no finalists.
 */
export function finalistsOf(show: Show): string[] {
  if (show.rounds.at(-1)?.type !== "final") return [];
  return show.rounds.at(-2)?.qualified ?? [];
}
```

Extend the file's type import at the top:

```ts
import type { RoundType, Show } from "./types";
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `bun test src/rounds.test.ts && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/rounds.ts src/rounds.test.ts
git commit -m "feat: hang each round's survivors off the round itself"
```

---

### Task 2: `fieldOf` — the colour rules

**Files:**
- Create: `src/field.ts`
- Test: `src/field.test.ts`

The rules, restated so they can be checked against the tests:

| Condition                                       | State     |
|-------------------------------------------------|-----------|
| In `show.winners`                               | `won`     |
| Missing from some round's `qualified`           | `out`     |
| Alive, and a round sits past the last resolved one (or the show has no rounds at all) | `playing` |
| Alive, otherwise                                | `through` |

A show with `winners` is finished, so nothing in it is `playing`.

- [ ] **Step 1: Write the failing tests**

Create `src/field.test.ts`:

```ts
import { expect, test } from "bun:test";
import { fieldOf } from "./field";
import type { Player, Show } from "./types";

const ROSTER: Player[] = [
  { fom: "Alpha_FOM", ingame: "Alpha" },
  { fom: "Bravo_FOM", ingame: "Bravo" },
  { fom: "Charlie_FOM", ingame: "Charlie" },
  { fom: "Delta_FOM", ingame: "Delta" },
  { fom: "Ref_FOM", ingame: "Ref", admin: true },
  { fom: "Unreported_FOM" },
];

function states(show: Show): Record<string, string> {
  return Object.fromEntries(fieldOf(show, ROSTER).map((p) => [p.ingame, p.state]));
}

test("a show with nothing read yet leaves everyone in play", () => {
  const show: Show = { name: "Solos", rounds: [{ map: "Dizzy Heights", type: "race" }] };
  expect(states(show)).toEqual({
    Alpha: "playing",
    Bravo: "playing",
    Charlie: "playing",
    Delta: "playing",
  });
});

test("a show that has not loaded a round yet leaves everyone in play", () => {
  expect(states({ name: "Solos", rounds: [] })).toEqual({
    Alpha: "playing",
    Bravo: "playing",
    Charlie: "playing",
    Delta: "playing",
  });
});

test("admins and players with no in-game name are not in the field", () => {
  const field = fieldOf({ name: "Solos", rounds: [] }, ROSTER);
  expect(field.map((p) => p.ingame)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("a name missing from a board went out on that round", () => {
  const show: Show = {
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] }],
  };
  expect(states(show)).toEqual({
    Alpha: "through",
    Bravo: "through",
    Charlie: "through",
    Delta: "out",
  });
  expect(fieldOf(show, ROSTER).find((p) => p.ingame === "Delta")?.outAt).toBe(1);
});

test("survivors go back into play once the next round has loaded", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival" },
    ],
  };
  expect(states(show)).toEqual({
    Alpha: "playing",
    Bravo: "playing",
    Charlie: "playing",
    Delta: "out",
  });
});

test("a player only goes out on the first board that drops them", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha"] },
    ],
  };
  const field = fieldOf(show, ROSTER);
  expect(field.find((p) => p.ingame === "Charlie")?.outAt).toBe(1);
  expect(field.find((p) => p.ingame === "Bravo")?.outAt).toBe(2);
});

test("a finished show crowns its winners and leaves the finalists through", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final" },
    ],
    winners: ["Alpha"],
  };
  expect(states(show)).toEqual({
    Alpha: "won",
    Bravo: "through",
    Charlie: "out",
    Delta: "out",
  });
});

test("rounds crossed first are counted against the player", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Alpha" },
      { map: "Tip Toe", type: "race", first: "Alpha" },
      { map: "Hoopsie", type: "race", first: "Bravo" },
    ],
  };
  const field = fieldOf(show, ROSTER);
  expect(field.find((p) => p.ingame === "Alpha")?.firsts).toEqual([1, 2]);
  expect(field.find((p) => p.ingame === "Bravo")?.firsts).toEqual([3]);
  expect(field.find((p) => p.ingame === "Charlie")?.firsts).toEqual([]);
});

test("winners lead, then the living, then the out, alphabetically inside each", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Bravo", "Charlie"] },
      { map: "Fall Mountain", type: "final" },
    ],
    winners: ["Charlie"],
  };
  expect(fieldOf(show, ROSTER).map((p) => p.ingame)).toEqual([
    "Charlie",
    "Bravo",
    "Alpha",
    "Delta",
  ]);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test src/field.test.ts`
Expected: FAIL — cannot resolve `./field`.

- [ ] **Step 3: Write `src/field.ts`**

```ts
import type { Player, Show } from "./types";

export type FieldState = "won" | "through" | "playing" | "out";

export interface FieldPlayer {
  ingame: string;
  fom: string;
  state: FieldState;
  /** 1-based rounds this player crossed first. */
  firsts: number[];
  /** 1-based round they went out on. Only set when out. */
  outAt?: number;
}

const ORDER: Record<FieldState, number> = { won: 0, through: 1, playing: 1, out: 2 };

/**
 * A player knocked out in round 1 is named on no screen at all, so the roster is the baseline red
 * is measured against: everyone at the LAN plays every show.
 */
export function fieldOf(show: Show, players: Player[]): FieldPlayer[] {
  const roster = players.filter(
    (player): player is Player & { ingame: string } => !player.admin && !!player.ingame,
  );

  const outAt = new Map<string, number>();
  let alive = new Set(roster.map((player) => player.ingame));
  for (const [index, round] of show.rounds.entries()) {
    if (!round.qualified) continue;
    const through = new Set(round.qualified);
    for (const name of alive) if (!through.has(name)) outAt.set(name, index + 1);
    alive = new Set([...alive].filter((name) => through.has(name)));
  }

  const firsts = new Map<string, number[]>();
  for (const [index, round] of show.rounds.entries()) {
    if (!round.first) continue;
    firsts.set(round.first, [...(firsts.get(round.first) ?? []), index + 1]);
  }

  const winners = new Set(show.winners ?? []);
  const finished = winners.size > 0;
  const resolved = show.rounds.findLastIndex((round) => round.qualified !== undefined);
  // Survivors go green when a board is read and grey again the moment the next round loads.
  const open = !finished && (show.rounds.length === 0 || resolved < show.rounds.length - 1);

  const field = roster.map((player) => {
    const round = outAt.get(player.ingame);
    const state: FieldState = winners.has(player.ingame)
      ? "won"
      : round !== undefined
        ? "out"
        : open
          ? "playing"
          : "through";
    return {
      ingame: player.ingame,
      fom: player.fom,
      state,
      firsts: firsts.get(player.ingame) ?? [],
      ...(state === "out" ? { outAt: round } : {}),
    };
  });

  return field.sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.ingame.localeCompare(b.ingame),
  );
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `bun test src/field.test.ts && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/field.ts src/field.test.ts
git commit -m "feat: work out who is still in a show from the boards read"
```

---

### Task 3: Delete `Show.finalists`

One commit, because the type change breaks every reader at once.

**Files:**
- Modify: `src/types.ts:20-26`, `src/scoring.ts:36`, `src/event.ts:47-63`, `src/data-check.ts:35-39`
- Modify: `site/admin-model.ts:69`, `site/admin-model.ts:105`, `site/admin-model.ts:113`, `site/admin-model.ts:126`, `site/admin-model.ts:154`
- Modify: `site/results.ts:36-38`
- Modify: `data/event.json`
- Test: `src/event.test.ts`, `src/scoring.test.ts`, `src/data-check.test.ts`, `site/admin-model.test.ts`, `site/results.test.ts`

`ShowDraft.finalists` **stays** for now — it is the admin's own editing shape, and Task 7 replaces
it. What changes here is that `toShow` writes it onto the semi's `qualified` and `draftFromShow`
reads it back through `finalistsOf`.

- [ ] **Step 1: Write the failing tests**

In `src/event.test.ts`, replace the five `closeShow` tests with these — every one now plays a
round before the final, because that is the round the finalists hang off:

```ts
test("closeShow records the final round, its finalists and its winners", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, {
    map: "Fall Mountain",
    finalists: ["Alpha", "Bravo"],
    winners: ["Alpha"],
  });
  const show = currentShow(event);
  expect(show.rounds).toEqual([
    { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
    { map: "Fall Mountain", type: "final" },
  ]);
  expect(show.winners).toEqual(["Alpha"]);
});

test("closeShow accepts an empty winners list for a timed-out final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, { map: "Hex-A-Gone", finalists: ["Alpha"], winners: [] });
  expect(currentShow(event).winners).toEqual([]);
});

test("closeShow rejects a winner who did not reach the final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  expect(() =>
    closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Bravo"] }),
  ).toThrow(ValidationError);
});

test("closeShow rejects a show with no round before its final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  expect(() =>
    closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] }),
  ).toThrow(ValidationError);
});

test("closeShow rejects a show that is already closed", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] });
  expect(() =>
    closeShow(event, { map: "Hex-A-Gone", finalists: ["Bravo"], winners: ["Bravo"] }),
  ).toThrow(ValidationError);
});

test("addRound rejects a show that is already closed", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] });
  expect(() => addRound(event, { map: "Tip Toe", type: "race", first: "Alpha" })).toThrow(
    ValidationError,
  );
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test src/event.test.ts`
Expected: FAIL — `show.rounds` has no `qualified`, and the no-semi case does not throw.

- [ ] **Step 3: Drop the field from the type**

In `src/types.ts`, replace the `Show` interface:

```ts
export interface Show {
  name: string;
  /** In-game names of the final's winners. More than one means a simultaneous win. */
  winners?: string[];
  rounds: Round[];
}
```

- [ ] **Step 4: Make `closeShow` write the semi's board**

In `src/event.ts`, replace `closeShow`:

```ts
export function closeShow(
  event: TournamentEvent,
  final: { map: string; finalists: string[]; winners: string[] },
): void {
  const show = currentShow(event);
  if (isClosed(show)) {
    throw new ValidationError(`Show "${show.name}" is already closed.`);
  }
  const semi = show.rounds.at(-1);
  if (!semi) {
    throw new ValidationError(
      `Show "${show.name}" has no round before its final, so its finalists have nowhere to go.`,
    );
  }
  const notFinalists = final.winners.filter((w) => !final.finalists.includes(w));
  if (notFinalists.length > 0) {
    throw new ValidationError(
      `Winners must have reached the final: ${notFinalists.join(", ")} did not.`,
    );
  }
  semi.qualified = final.finalists;
  show.winners = final.winners;
  show.rounds.push({ map: final.map, type: "final" });
}
```

- [ ] **Step 5: Point scoring at `finalistsOf`**

In `src/scoring.ts`, change the import line and the finalists loop:

```ts
import { finalistsOf, SCORES_FIRST } from "./rounds";
```

```ts
    for (const ingame of finalistsOf(show)) {
```

- [ ] **Step 6: Move the data check onto `qualified`**

In `src/data-check.ts`, replace the two-key loop with a single-key check:

```ts
      if (show.winners !== undefined && !names(show.winners)) {
        problems.push(`${at}.winners is not an array of names`);
      }
```

and inside the per-round loop, after the `first` check:

```ts
        if (round.qualified !== undefined && !names(round.qualified)) {
          problems.push(`${on}.qualified is not an array of names`);
        }
```

- [ ] **Step 7: Bridge the admin draft**

In `site/admin-model.ts`, `draftFromShow` reads the derived value:

```ts
    finalists: [...finalistsOf(show)],
```

`toShow` writes it onto the semi and stops writing `finalists`:

```ts
export function toShow(draft: ShowDraft): Show {
  const rounds: Round[] = draft.rounds.map((round) => {
    const first = round.first.trim();
    return SCORES_FIRST.has(round.type) && first
      ? { map: round.map, type: round.type, first }
      : { map: round.map, type: round.type };
  });

  const finalists = filled(draft.finalists);
  const semi = rounds.at(-1)?.type === "final" ? rounds.at(-2) : undefined;
  if (semi && finalists.length > 0) semi.qualified = finalists;

  return {
    name: draft.name.trim(),
    rounds,
    winners: filled(draft.winners),
  };
}
```

`missingFrom` reads the derived value too:

```ts
  const entered: Show = show ?? { name: "", rounds: [], winners: [] };
```

```ts
  if (finalistsOf(entered).length === 0) gaps.push("finalists");
```

`namesInShows` picks up every board rather than one:

```ts
  const names = event.shows.flatMap((show) => [
    ...show.rounds.map((round) => round.first),
    ...show.rounds.flatMap((round) => round.qualified ?? []),
    ...(show.winners ?? []),
  ]);
```

Add the import at the top of the file:

```ts
import { finalistsOf, SCORES_FIRST } from "../src/rounds";
```

and drop the now-duplicated `import { SCORES_FIRST } from "../src/rounds";` line, keeping the
existing `export { ROUND_TYPES, SCORES_FIRST } from "../src/rounds";` re-export as it is.

- [ ] **Step 8: Keep the results page compiling**

In `site/results.ts`, replace the `finalists` paragraph with the derived list. Task 4 replaces
this again with the chip grid; this step only keeps the build green.

```ts
  const names = finalistsOf(show);
  const finalists = names.length
    ? `<p class="finalists">Finalists: <b>${names.map(escapeHtml).join(", ")}</b></p>`
    : "";
```

Add to the imports:

```ts
import { finalistsOf } from "../src/rounds";
```

- [ ] **Step 9: Migrate the recorded data**

Both shows in `data/event.json` carry `"finalists": []`, so nothing is lost. Delete both lines.

Run: `bun -e 'const e = await Bun.file("data/event.json").json(); for (const s of e.shows) delete s.finalists; await Bun.write("data/event.json", JSON.stringify(e, null, 2) + "\n");'`

Then confirm: `grep -c finalists data/event.json`
Expected: `0`

- [ ] **Step 10: Fix the remaining test fixtures**

Every `finalists:` key on a `Show` literal in `src/scoring.test.ts`, `src/data-check.test.ts`,
`site/admin-model.test.ts` and `site/results.test.ts` becomes a `qualified:` array on the round
before the final. For example `site/results.test.ts`'s `SOLOS`:

```ts
const SOLOS: Show = {
  name: "Solos",
  rounds: [
    { map: "Dizzy Heights", type: "race", first: "Alpha" },
    { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
    { map: "Fall Mountain", type: "final" },
  ],
  winners: ["Alpha"],
};
```

Find them all: `grep -rn "finalists:" --include=*.test.ts src site`

- [ ] **Step 11: Run everything**

Run: `bun test && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: derive a show's finalists from the board before its final"
```

---

### Task 4: The chip grid on the results page

**Files:**
- Create: `site/show-field.ts`
- Test: `site/show-field.test.ts`
- Modify: `site/results.ts`, `site/main.ts:54`
- Modify: `site/styles.css` (replace the `.finalists` rules at `site/styles.css:390-391`)
- Test: `site/results.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `site/show-field.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { Player, Show } from "../src/types";
import { renderShowField } from "./show-field";

const ROSTER: Player[] = [
  { fom: "Alpha_FOM", ingame: "Alpha" },
  { fom: "Bravo_FOM", ingame: "Bravo" },
  { fom: "Charlie_FOM", ingame: "Charlie" },
];

const FINISHED: Show = {
  name: "Solos",
  rounds: [
    { map: "Dizzy Heights", type: "race", first: "Alpha", qualified: ["Alpha", "Bravo"] },
    { map: "Fall Mountain", type: "final" },
  ],
  winners: ["Alpha"],
};

test("every player in the field gets a chip", () => {
  const html = renderShowField(FINISHED, ROSTER);
  expect(html).toContain("Alpha");
  expect(html).toContain("Bravo");
  expect(html).toContain("Charlie");
});

test("a chip carries its state as a class", () => {
  const html = renderShowField(FINISHED, ROSTER);
  expect(html).toContain(`class="bn won"`);
  expect(html).toContain(`class="bn through"`);
  expect(html).toContain(`class="bn out"`);
});

test("a knocked-out chip says which round did it", () => {
  expect(renderShowField(FINISHED, ROSTER)).toContain("out R1");
});

test("rounds crossed first are marked on the chip", () => {
  expect(renderShowField(FINISHED, ROSTER)).toContain("⚡1");
});

test("an empty roster renders nothing", () => {
  expect(renderShowField(FINISHED, [])).toBe("");
});

test("a name is escaped", () => {
  const html = renderShowField(FINISHED, [{ fom: "X", ingame: "<script>" }]);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test site/show-field.test.ts`
Expected: FAIL — cannot resolve `./show-field`.

- [ ] **Step 3: Write `site/show-field.ts`**

```ts
import { fieldOf, type FieldPlayer } from "../src/field";
import type { Player, Show } from "../src/types";
import { escapeHtml } from "./render";

function note(player: FieldPlayer): string {
  if (player.outAt !== undefined) return `out R${player.outAt}`;
  return player.firsts.length > 0 ? `⚡${player.firsts.join(" ⚡")}` : "";
}

function chip(player: FieldPlayer): string {
  const crown = player.state === "won" ? "👑 " : "";
  const detail = note(player);
  return `<span class="bn ${player.state}">${crown}<b>${escapeHtml(player.ingame)}</b>${
    detail ? `<small>${detail}</small>` : ""
  }</span>`;
}

export function renderShowField(show: Show, players: Player[]): string {
  const field = fieldOf(show, players);
  if (field.length === 0) return "";
  return `<div class="beans">${field.map(chip).join("")}</div>`;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test site/show-field.test.ts`
Expected: PASS.

- [ ] **Step 5: Put the grid in the show panel**

In `site/results.ts`, `renderShow` and `renderResults` take the roster. Replace the finalists
paragraph and thread `players` through:

```ts
function renderShow(show: Show, number: number, live: boolean, players: Player[]): string {
```

```ts
  const finalists = renderShowField(show, players);
```

```ts
export function renderResults(
  shows: Show[],
  players: Player[],
  now: LiveNow | null = null,
): string {
```

```ts
  const recorded = shows
    .map((show, index) =>
      renderShow(show, index + 1, !unrecorded && index === last && !show.winners?.length, players),
    )
    .reverse()
    .join("");
```

Imports become:

```ts
import type { LiveNow } from "../src/live";
import type { Player, Round, Show } from "../src/types";
import { escapeHtml } from "./render";
import { renderShowField } from "./show-field";
```

The `finalistsOf` import added in Task 3 Step 8 is no longer used — drop it, or `noUnusedLocals`
fails the typecheck.

- [ ] **Step 6: Update the caller**

In `site/main.ts`, the results case:

```ts
    case "results":
      return renderResults(data.event.shows, data.players.players, data.now);
```

- [ ] **Step 7: Update `site/results.test.ts`**

Every `renderResults(...)` call gains a roster argument. Add at the top of the file:

```ts
import type { Player } from "../src/types";

const ROSTER: Player[] = [
  { fom: "Alpha_FOM", ingame: "Alpha" },
  { fom: "Bravo_FOM", ingame: "Bravo" },
];
```

and change `renderResults([SOLOS])` to `renderResults([SOLOS], ROSTER)`, `renderResults([])` to
`renderResults([], ROSTER)`, and the two-argument live calls `renderResults(shows, now)` to
`renderResults(shows, ROSTER, now)`. Any assertion on the old `Finalists: ` string becomes an
assertion on the chip grid:

```ts
test("a show panel colours the field", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toContain(`class="bn won"`);
  expect(html).toContain("Bravo");
});
```

- [ ] **Step 8: Style the chips**

In `site/styles.css`, replace the two `.finalists` rules with:

```css
.beans { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.8rem; }

.bn {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
  font-size: 14px;
  border: 2px solid transparent;
  background: #ffffff14;
  color: #ffffffb8;
}

.bn b { font-weight: 800; }
.bn small { font-size: 11px; font-weight: 800; opacity: 0.8; }

.bn.won { background: linear-gradient(#ffe27a, var(--yellow)); color: var(--ink); }
.bn.through { background: #6ee78730; border-color: var(--lime); color: #fff; }
.bn.playing { border-color: #ffffff2e; }
.bn.out { background: #ff6b6b1c; border-color: #ff6b6b4d; color: #ffffff70; }
.bn.out b { text-decoration: line-through; }
```

- [ ] **Step 9: Run everything**

Run: `bun test && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: colour the field on every show in the results"
```

---

### Task 5: The panel above the podium

**Files:**
- Modify: `site/show-field.ts`
- Modify: `site/main.ts:48-50`
- Test: `site/show-field.test.ts`

The show it describes is the live one where that has been recorded, and the last recorded show
otherwise, so a projected board never loses a row between shows.

- [ ] **Step 1: Write the failing tests**

Append to `site/show-field.test.ts`, extending the imports already at the top of the file with
`import type { LiveStatus } from "../src/live";`, `TournamentEvent` on the existing
`../src/types` import, and `renderShowNow` on the existing `./show-field` import:

```ts
const LIVE: Show = {
  name: "Sweet Thieves",
  rounds: [
    { map: "Dizzy Heights", type: "race", first: "Alpha", qualified: ["Alpha", "Bravo"] },
    { map: "Roll Out", type: "survival" },
  ],
};

const PLAYING: LiveStatus = {
  state: "playing",
  showNumber: 2,
  showName: "Sweet Thieves",
  orderIndex: 1,
  round: 2,
  lastRound: { map: "Roll Out", type: "survival" },
  roundLive: true,
};

function event(shows: Show[]): TournamentEvent {
  return { name: "FOM", date: "2026-09-01", shows, penalties: [] };
}

test("the panel names the show, its number and the round on screen", () => {
  const html = renderShowNow(event([FINISHED, LIVE]), ROSTER, PLAYING);
  expect(html).toContain("Sweet Thieves");
  expect(html).toContain("Round 2");
  expect(html).toContain("Roll Out");
});

test("the panel counts who is left", () => {
  const html = renderShowNow(event([FINISHED, LIVE]), ROSTER, PLAYING);
  expect(html).toContain("2 of 3 still in");
});

test("a finished show is counted by its crown, not by who is left", () => {
  const html = renderShowNow(event([FINISHED]), ROSTER, {
    state: "between",
    showNumber: 1,
    showName: "Solos",
    orderIndex: 0,
  });
  expect(html).toContain("👑");
  expect(html).not.toContain("still in");
});

test("a show being played that has not been recorded falls back to the last recorded one", () => {
  const html = renderShowNow(event([FINISHED]), ROSTER, { ...PLAYING, showNumber: 2 });
  expect(html).toContain("Solos");
});

test("nothing recorded yet renders nothing", () => {
  expect(renderShowNow(event([]), ROSTER, PLAYING)).toBe("");
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test site/show-field.test.ts`
Expected: FAIL — `renderShowNow` is not exported.

- [ ] **Step 3: Add `renderShowNow`**

Append to `site/show-field.ts`:

```ts
function tally(show: Show, field: FieldPlayer[]): string {
  if (show.winners?.length) {
    return `<span class="champ">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`;
  }
  const out = field.filter((player) => player.state === "out").length;
  return `<span class="count">${field.length - out} of ${field.length} still in</span>`;
}

function roundLine(status: LiveStatus): string {
  const round = status.round === undefined ? "" : `Round ${status.round}`;
  const last = status.lastRound;
  if (!last) return round ? `<span class="lbl">${round}</span>` : "";
  return `<span class="lbl">${round}${round ? " · " : ""}${escapeHtml(last.map)}</span>
      <span class="tag ${last.type}">${last.type}</span>`;
}

/**
 * The show on the wall, or the last one recorded once it is over, so the panel never disappears
 * out from under the podium between shows.
 */
export function renderShowNow(
  event: TournamentEvent,
  players: Player[],
  status: LiveStatus,
): string {
  const show = event.shows[(status.showNumber ?? 0) - 1] ?? event.shows.at(-1);
  if (!show) return "";
  const number = event.shows.indexOf(show) + 1;

  const field = fieldOf(show, players);
  const grid = field.length === 0 ? "" : `<div class="beans">${field.map(chip).join("")}</div>`;

  return `
    <div class="panel shownow">
      <header>
        <span class="num">${number}</span>
        <h3>${escapeHtml(show.name)}</h3>
        ${roundLine(status)}
        ${tally(show, field)}
      </header>
      ${grid}
    </div>`;
}
```

Extend the imports at the top of the file:

```ts
import type { LiveStatus } from "../src/live";
import { fieldOf, type FieldPlayer } from "../src/field";
import type { Player, Show, TournamentEvent } from "../src/types";
import { escapeHtml } from "./render";
```

- [ ] **Step 4: Put the panel on the dashboard**

In `site/main.ts`, the dashboard case:

```ts
    case "dashboard":
      return (
        renderStatus(status, data.order) +
        renderShowNow(data.event, data.players.players, status) +
        renderPodium(rows) +
        renderField(rows, movers)
      );
```

and the import:

```ts
import { renderShowNow } from "./show-field";
```

- [ ] **Step 5: Style the panel**

Append to `site/styles.css`, after the `.bn` rules:

```css
.shownow { margin-bottom: 1.6rem; }
.shownow > header { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.shownow h3 { margin: 0; font: 400 26px/1 "Bebas Neue", sans-serif; letter-spacing: 0.06em; }
.shownow .num {
  font-family: "Titan One", cursive;
  font-size: 15px;
  color: var(--ink);
  background: var(--cyan);
  border-radius: 8px;
  padding: 0.15rem 0.5rem;
}
.shownow .count { margin-left: auto; font-weight: 800; color: var(--lime); }
.shownow .champ { margin-left: auto; font-weight: 800; }
```

- [ ] **Step 6: Run everything**

Run: `bun test && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: See it**

Run: `bun run build && bun run dev`
Open <http://localhost:3000> and <http://localhost:3000/results.html>. The dashboard carries the
panel between the ribbon and the podium; every show on the results page carries the grid. Stop
the server when done.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: show who is left in the running show above the podium"
```

---

### Task 6: Fill `qualified` from every board

`fillsFor` reads every qualification board already and throws away all but the one before the
final. Boards land in their own round's window — a window runs from one round loading to the
next — so the shot's `roundIndex` is the round the board followed.

**Files:**
- Modify: `src/ocr/autofill.ts`
- Test: `src/ocr/autofill.test.ts`

- [ ] **Step 1: Rewrite the two board tests**

In `src/ocr/autofill.test.ts`, replace the first two tests — both assert the old behaviour — with:

```ts
test("a board read after the round before the final names the finalists", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 2, namesFinalists: true })];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    {
      showIndex: 0,
      slot: "qualified",
      roundIndex: 2,
      names: ["Diego_9942", "Serxav_9"],
      from: "g.jpg",
    },
  ]);
});

test("a board read after any other round names that round's survivors", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 0 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "qualified", roundIndex: 0, names: ["Diego_9942"], from: "g.jpg" },
  ]);
});

test("a board caught during the final belongs to no round, so it fills nothing", () => {
  const shots = [shot("g.jpg", { slot: "finalists" })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([]);
});
```

`namesFinalists` stops being load-bearing for autofill — it stays only so the capture panel can
group the board with the final. `windowsFor` gives the final's own window no `roundIndex`, which
is what keeps the last test honest.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test src/ocr/autofill.test.ts`
Expected: FAIL — the grid branch still produces a `finalists` fill, or nothing.

- [ ] **Step 3: Rewrite the grid branch**

In `src/ocr/autofill.ts`, change the slot union and the grid branch:

```ts
export interface SlotFill {
  showIndex: number;
  slot: "first" | "qualified" | "winners";
  roundIndex?: number;
  names: string[];
  /** The capture the names were read off, so a wrong one can be traced back. */
  from: string;
}
```

```ts
    // A board turns up after every round, and lands in the window of the round it followed.
    if (read.screen === "grid") {
      if (shot.roundIndex !== undefined) {
        fills.push({
          showIndex: shot.showIndex,
          slot: "qualified",
          roundIndex: shot.roundIndex,
          names,
          from: shot.file,
        });
      }
      continue;
    }
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/ocr/autofill.test.ts`
Expected: PASS.

- [ ] **Step 5: Hold the commit**

`bun run typecheck` still fails in `site/admin-model.ts`, where `applyFills` branches on
`"finalists"`. Task 7 fixes that, and the two land in one commit. Move on.

---

### Task 7: A Qualified block on every round

**Files:**
- Modify: `site/admin-model.ts`
- Modify: `site/admin.ts:466-471`, `site/admin.ts:534-542`
- Test: `site/admin-model.test.ts`

`ShowDraft.finalists` is replaced by `RoundDraft.qualified`, one list per round, sized by the
log's own count for that round. The log knows exactly how many names each board holds, so a
misread is visible as a blank slot.

- [ ] **Step 1: Write the failing tests**

Append to `site/admin-model.test.ts`, reusing the file's existing `ParsedShow` fixtures:

```ts
test("a round's qualified list is sized by what the log counted", () => {
  const parsed: ParsedShow = {
    showId: "classic_solo_main_show",
    rounds: [
      {
        id: "round_dizzy_heights",
        name: "Dizzy Heights",
        type: "race",
        isFinal: false,
        timedOut: false,
        present: [1, 2, 3],
        qualified: [1, 2],
        eliminated: [3],
      },
    ],
  };
  const draft = draftFor(parsed, "Solos");
  expect(draft.rounds[0]!.qualified).toEqual(["", ""]);
});

test("toShow writes each round's typed survivors onto the round", () => {
  const draft: ShowDraft = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Alpha", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final", first: "", qualified: [] },
    ],
    winners: ["Alpha"],
  };
  expect(toShow(draft).rounds[0]).toEqual({
    map: "Dizzy Heights",
    type: "race",
    first: "Alpha",
    qualified: ["Alpha", "Bravo"],
  });
});

test("a round nobody has been typed into carries no survivors", () => {
  const draft: ShowDraft = {
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", first: "", qualified: ["", ""] }],
    winners: [],
  };
  expect(toShow(draft).rounds[0]).toEqual({ map: "Dizzy Heights", type: "race" });
});

test("a board fill drops into the round it was read after", () => {
  const draft: ShowDraft = {
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", first: "", qualified: ["", ""] }],
    winners: [],
  };
  applyFills(
    draft,
    [{ showIndex: 0, slot: "qualified", roundIndex: 0, names: ["Alpha", "Bravo"], from: "g.jpg" }],
    0,
    newFillMemo(),
  );
  expect(draft.rounds[0]!.qualified).toEqual(["Alpha", "Bravo"]);
});
```

Then update every existing test in the file that builds a `ShowDraft` with `finalists`, and every
assertion on `draft.finalists`, to use the round's `qualified` instead. Find them:
`grep -n "finalists" site/admin-model.test.ts`

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test site/admin-model.test.ts`
Expected: FAIL — `RoundDraft` has no `qualified`.

- [ ] **Step 3: Move the list onto the round draft**

In `site/admin-model.ts`:

```ts
export interface RoundDraft {
  map: string;
  type: RoundType;
  first: string;
  /** One slot per name the log counted through this round. */
  qualified: string[];
  /** Set once the admin picks a type, so the log never overrides their judgement. */
  typeEdited?: boolean;
}

export interface ShowDraft {
  name: string;
  rounds: RoundDraft[];
  winners: string[];
}
```

```ts
export function draftFor(parsed: ParsedShow, name = ""): ShowDraft {
  const draft: ShowDraft = { name, rounds: [], winners: [] };
  syncDraft(draft, parsed);
  return draft;
}
```

```ts
export function syncDraft(draft: ShowDraft, parsed: ParsedShow): void {
  for (const round of parsed.rounds.slice(draft.rounds.length)) {
    draft.rounds.push({ map: round.name, type: round.type, first: "", qualified: [] });
  }

  parsed.rounds.forEach((round, index) => {
    const entry = draft.rounds[index];
    if (!entry) return;
    if (!entry.typeEdited) entry.type = round.type;
    fit(entry.qualified, round.qualified.length);
  });

  // parseLog calls the last round a final, but mid-show that is only the round being played.
  const last = parsed.rounds.at(-1);
  const final = last?.type === "final" || parsed.winnerId !== undefined ? last : undefined;

  // Whoever succeeded in the final won it, however many that turns out to be.
  fit(draft.winners, Math.max(final?.qualified.length ?? 0, parsed.winnerId === undefined ? 0 : 1));
}
```

The final round's own board never comes up — the winner screen stands in — so `fit` sizing it to
`round.qualified.length` is harmless: those slots are the winners, and the Winners block owns
them. Leave the final's Qualified block off the page in Step 5.

```ts
export function draftFromShow(show: Show, parsed: ParsedShow): ShowDraft {
  const draft: ShowDraft = {
    name: show.name,
    rounds: show.rounds.map((round) => ({
      map: round.map,
      type: round.type,
      first: round.first ?? "",
      qualified: [...(round.qualified ?? [])],
      typeEdited: true,
    })),
    winners: [...(show.winners ?? [])],
  };
  syncDraft(draft, parsed);
  return draft;
}
```

```ts
export function toShow(draft: ShowDraft): Show {
  const rounds: Round[] = draft.rounds.map((round) => {
    const first = round.first.trim();
    const qualified = filled(round.qualified);
    return {
      map: round.map,
      type: round.type,
      ...(SCORES_FIRST.has(round.type) && first ? { first } : {}),
      ...(qualified.length > 0 ? { qualified } : {}),
    };
  });

  return { name: draft.name.trim(), rounds, winners: filled(draft.winners) };
}
```

```ts
export function missingFrom(show: Show | undefined, parsed: ParsedShow): string[] {
  // An unrecorded show is every gap at once, so it reads the same as one saved empty.
  const entered: Show = show ?? { name: "", rounds: [], winners: [] };
  ...
```

`validate` moves from the finalists list to every round's:

```ts
export function validate(draft: ShowDraft): string[] {
  const problems: string[] = [];

  if (!draft.name.trim()) problems.push("Give the show a name.");

  draft.rounds.forEach((round, index) => {
    const names = filled(round.qualified);
    const twice = names.filter((name, at) => names.indexOf(name) !== at);
    for (const name of new Set(twice)) {
      problems.push(`${name} is listed twice as qualifying from round ${index + 1}.`);
    }
  });

  return problems;
}
```

`fieldKey` and `applyFills` follow the new slot:

```ts
function fieldKey(showIndex: number, fill: SlotFill, slot: number): string {
  if (fill.slot === "first") return `show:${showIndex}:round:${fill.roundIndex}:first`;
  if (fill.slot === "qualified") {
    return `show:${showIndex}:round:${fill.roundIndex}:qualified:${slot}`;
  }
  return `show:${showIndex}:winner:${slot}`;
}
```

```ts
    const round = fill.roundIndex === undefined ? undefined : draft.rounds[fill.roundIndex];
    const slot = fill.slot === "qualified" ? round?.qualified : draft.winners;
    if (!slot) continue;
    const spent = fill.slot === "qualified" ? `${fill.roundIndex}:qualified` : "winners";
    for (const name of fill.names) {
      if (slot.includes(name)) continue;
      if (memo.applied.has(`${showIndex}:${spent}=${name}`)) continue;
      const blank = slot.indexOf("");
      if (blank === -1) break;
      slot[blank] = name;
      memo.sources.set(fieldKey(showIndex, fill, blank), fill.from);
      memo.applied.add(`${showIndex}:${spent}=${name}`);
      changed = true;
    }
```

`finalistsOf` is no longer used in this file — drop it from the import, keeping `SCORES_FIRST`.

- [ ] **Step 4: Run the model tests**

Run: `bun test site/admin-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Put the block on each round in the admin**

In `site/admin.ts`, delete the `finalists` input list (`site/admin.ts:466-471`) and the Finalists
`selectable` block (`site/admin.ts:534-542`). Inside the `rounds` map, after the `hint` cell is
pushed and before the `return`, add the block for every round but the final:

```ts
    if (entry.type !== "final") {
      const qualified = entry.qualified.map((value, slot) =>
        nameInput(`show:${index}:round:${roundIndex}:qualified:${slot}`, value, (next) => {
          entry.qualified[slot] = next;
        }),
      );
      cells.push(
        el("div", { class: "field qualified" }, [
          el("label", {}, [`Qualified (${qualified.length})`]),
          el("div", { class: "names" }, qualified),
        ]),
      );
    }
```

The round row is already `selectable` on `{ slot: "round", roundIndex }`, which is the window the
board capture lands in, so clicking the row still brings up the right captures.

Update `SLOT_LABELS` at `site/admin.ts:317-324` — `finalists` now labels only the final round's
own window:

```ts
const SLOT_LABELS: Record<Selection["slot"], string> = {
  round: "This round",
  finalists: "The final",
  winners: "Winners",
  show: "Between this show's rounds",
  all: "Everything from this show",
  unmatched: "Outside every show",
};
```

The `.rnd` grid in the admin's own stylesheet is a row of columns; a block added to it needs to
span. Append to `site/admin.css`:

```css
.rounds .field.qualified { grid-column: 1 / -1; }
```

Check the actual selector the admin's round `<li>` uses before pasting — if `site/admin.css` lays
the round out with flex rather than grid, use `flex-basis: 100%` instead.

- [ ] **Step 6: Run everything**

Run: `bun test && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: See it**

Run: `bun run build && bun run dev`
Open <http://localhost:3000/admin>. Every non-final round carries a **Qualified (N)** block, N
matching the `N qualified` hint on the same row. Stop the server when done.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: read and correct every round's survivors"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md:174-190`, `README.md` page table

- [ ] **Step 1: Update the OCR table**

Replace the table's grid row and the paragraph under it:

```markdown
| Screen                 | Fills                    | Read from                        |
|------------------------|--------------------------|----------------------------------|
| Qualification board    | `rounds[n].qualified`    | the name over every green card   |
| Winner screen          | `winners`                | the nameplate under the bean     |
| Qualified toast        | `rounds[n].first`        | the pill wearing the gold trophy |

The board comes up after **every** round, and every one of them is read: the survivors go onto the
round they were read after. The finalists are the survivors of the round before the final, so they
are not stored separately.
```

- [ ] **Step 2: Update the page table**

```markdown
| Dashboard  | Which show and round is on, who is left in it, the podium, and the rest of the field |
| Results    | Every show round by round, newest first, with the field coloured                     |
```

Add below that table:

```markdown
Every show carries its field: gold won it, green got through the last board read, grey is still in
the round on screen, red is out with the round number that did it. The field is the roster —
everyone in `players.json` who is not an admin and has an `ingame` name — because a player knocked
out in round 1 is named on no screen at all.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe the coloured field"
```

---

## Done

Run: `bun test && bun run typecheck && bun run build`
Expected: PASS, no type errors, `dist/` rebuilt.
