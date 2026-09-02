# Per-round elimination badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each round row on the results page carries the badges of the players it knocked out, and the show being played renders through the same path as every other show so its recorded first-crossers appear.

**Architecture:** `roundFieldsOf` in `src/field.ts` walks the same alive-set as `fieldOf` and hands back one bean list per round. `mergeLive` in `src/live.ts` folds the Fall Guys log onto whatever is recorded for the live show, which lets `site/results.ts` delete its second render path (`renderPlaying`) entirely. `site/show-field.ts` grows `renderRoundBeans` and loses the now-unused `renderShowField`.

**Tech Stack:** TypeScript, Bun (`bun test`), no framework — HTML is built by string templates.

---

## File Structure

| File | Responsibility after this change |
|-------------------------------|-----------------------------------------------------------------|
| `src/field.ts`                | Roster/alive-set logic. Adds `roundFieldsOf`, shares the roster and firsts helpers with `fieldOf`. |
| `src/live.ts`                 | Log-vs-recorded reconciliation. Adds `mergeLive`.                |
| `site/show-field.ts`          | Bean rendering. `chip` takes its note as an argument; adds `renderRoundBeans`; drops `renderShowField`. |
| `site/results.ts`             | One show render path. Drops `renderPlaying` and `winnerCell`'s blind spots. |
| `site/styles.css`             | `.rnd` becomes a two-row block carrying `.beans`.                |

---

## Task 1: `roundFieldsOf`

**Files:**
- Modify: `src/field.ts`
- Test: `src/field.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/field.test.ts`:

```ts
function beansOf(show: Show): string[][] {
  return roundFieldsOf(show, ROSTER).map((round) => round.map((p) => `${p.ingame}:${p.state}`));
}

test("round one reds everyone the roster lost, board or no board", () => {
  const show: Show = {
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo"] }],
  };
  expect(beansOf(show)).toEqual([["Charlie:out", "Delta:out"]]);
});

test("a round only reds the players it took, not the ones already gone", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha"] },
    ],
  };
  expect(beansOf(show)).toEqual([["Delta:out"], ["Bravo:out", "Charlie:out"]]);
});

test("a round nobody read a board for greys everyone still in", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival" },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Delta:out"],
    ["Alpha:playing", "Bravo:playing", "Charlie:playing"],
  ]);
});

test("deaths nobody read surface on the next round that was read", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race" },
      { map: "Roll Out", type: "survival", qualified: ["Alpha"] },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:playing", "Bravo:playing", "Charlie:playing", "Delta:playing"],
    ["Bravo:out", "Charlie:out", "Delta:out"],
  ]);
});

test("the final crowns its winners and reds the finalists they beat", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Fall Mountain", type: "final" },
    ],
    winners: ["Bravo"],
  };
  expect(beansOf(show)).toEqual([["Delta:out"], ["Bravo:won", "Alpha:out", "Charlie:out"]]);
});

test("a final still being played greys its finalists", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final" },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Charlie:out", "Delta:out"],
    ["Alpha:playing", "Bravo:playing"],
  ]);
});

test("a round that took nobody has no badges", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie", "Delta"] },
    ],
  };
  expect(beansOf(show)).toEqual([[]]);
});

test("a show with no rounds has no badge rows", () => {
  expect(roundFieldsOf({ name: "Solos", rounds: [] }, ROSTER)).toEqual([]);
});

test("a badge carries the rounds that player crossed first", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Delta", qualified: ["Alpha", "Bravo"] },
    ],
  };
  expect(roundFieldsOf(show, ROSTER)[0]?.find((p) => p.ingame === "Delta")?.firsts).toEqual([1]);
});
```

Change the import line at the top of the file to:

```ts
import { fieldOf, roundFieldsOf } from "./field";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/field.test.ts`
Expected: FAIL — `roundFieldsOf` is not exported by `./field`.

- [ ] **Step 3: Implement**

In `src/field.ts`, pull the roster and firsts lookups out of `fieldOf` so both functions share them, and add `roundFieldsOf`. Replace the body of the file after the `ORDER` constant with:

```ts
type Rostered = Player & { ingame: string };

function rosterOf(players: Player[]): Rostered[] {
  return players.filter(
    (player): player is Rostered => !player.admin && player.joined !== false && !!player.ingame,
  );
}

function firstsIn(show: Show): Map<string, number[]> {
  const firsts = new Map<string, number[]>();
  for (const [index, round] of show.rounds.entries()) {
    if (!round.first) continue;
    firsts.set(round.first, [...(firsts.get(round.first) ?? []), index + 1]);
  }
  return firsts;
}

function byState(a: FieldPlayer, b: FieldPlayer): number {
  return ORDER[a.state] - ORDER[b.state] || a.ingame.localeCompare(b.ingame);
}

/**
 * A player knocked out in round 1 is named on no screen at all, so the roster is the baseline red
 * is measured against: everyone at the LAN plays every show.
 */
export function fieldOf(show: Show, players: Player[]): FieldPlayer[] {
  const roster = rosterOf(players);

  const outAt = new Map<string, number>();
  let alive = new Set(roster.map((player) => player.ingame));
  for (const [index, round] of show.rounds.entries()) {
    if (!round.qualified) continue;
    const through = new Set(round.qualified);
    for (const name of alive) if (!through.has(name)) outAt.set(name, index + 1);
    alive = new Set([...alive].filter((name) => through.has(name)));
  }

  const firsts = firstsIn(show);
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

  return field.sort(byState);
}

/**
 * One badge list per round: who that round took, rather than where everybody ended up. A round
 * whose board nobody read cannot name its dead, so it shows everyone still in and its casualties
 * surface on the next round that was read.
 */
export function roundFieldsOf(show: Show, players: Player[]): FieldPlayer[][] {
  const firsts = firstsIn(show);
  const winners = new Set(show.winners ?? []);

  const bean = (player: Rostered, state: FieldState): FieldPlayer => ({
    ingame: player.ingame,
    fom: player.fom,
    state,
    firsts: firsts.get(player.ingame) ?? [],
  });

  let alive = rosterOf(players);
  return show.rounds.map((round) => {
    if (round.type === "final" && winners.size > 0) {
      const beans = alive.map((p) => bean(p, winners.has(p.ingame) ? "won" : "out"));
      alive = alive.filter((p) => winners.has(p.ingame));
      return beans.sort(byState);
    }
    if (!round.qualified) return alive.map((p) => bean(p, "playing")).sort(byState);

    const through = new Set(round.qualified);
    const beans = alive.filter((p) => !through.has(p.ingame)).map((p) => bean(p, "out"));
    alive = alive.filter((p) => through.has(p.ingame));
    return beans.sort(byState);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/field.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/field.ts src/field.test.ts
git commit -m "feat: work out who each round knocked out"
```

---

## Task 2: `mergeLive`

**Files:**
- Modify: `src/live.ts`
- Test: `src/live.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/live.test.ts`:

```ts
const LOG: LiveNow = {
  show: "Solos 2",
  showNumber: 2,
  round: 3,
  map: "Roll Out",
  type: "race",
  startedAt: "01:27:40",
  rounds: [
    { map: "Wall Guys", type: "race", qualified: 14 },
    { map: "Hoverboard Heroes", type: "survival", qualified: 9 },
    { map: "Roll Out", type: "race" },
  ],
};

test("a show nobody has typed in yet is the log's rounds under the log's name", () => {
  expect(mergeLive(undefined, LOG)).toEqual({
    name: "Solos 2",
    rounds: [
      { map: "Wall Guys", type: "race", survivors: 14 },
      { map: "Hoverboard Heroes", type: "survival", survivors: 9 },
      { map: "Roll Out", type: "race" },
    ],
  });
});

test("what has been recorded wins over the log, round for round", () => {
  const recorded: Show = {
    name: "Grand Final",
    rounds: [{ map: "Wall Guys", type: "hunt", first: "Alpha", qualified: ["Alpha"] }],
  };
  const merged = mergeLive(recorded, LOG);
  expect(merged.name).toBe("Grand Final");
  expect(merged.rounds[0]).toEqual({
    map: "Wall Guys",
    type: "hunt",
    first: "Alpha",
    qualified: ["Alpha"],
    survivors: 14,
  });
});

test("rounds the log has loaded past what is typed in are appended", () => {
  const recorded: Show = { name: "Solos 2", rounds: [{ map: "Wall Guys", type: "race" }] };
  expect(mergeLive(recorded, LOG).rounds.map((round) => round.map)).toEqual([
    "Wall Guys",
    "Hoverboard Heroes",
    "Roll Out",
  ]);
});

test("a recorded count is not overwritten by the log's", () => {
  const recorded: Show = {
    name: "Solos 2",
    rounds: [{ map: "Wall Guys", type: "race", survivors: 13 }],
  };
  expect(mergeLive(recorded, LOG).rounds[0]?.survivors).toBe(13);
});

test("recorded rounds the log never reported keep their place", () => {
  const recorded: Show = {
    name: "Solos 2",
    rounds: [
      { map: "Wall Guys", type: "race" },
      { map: "Hoverboard Heroes", type: "survival" },
      { map: "Roll Out", type: "race" },
      { map: "Hex-A-Gone", type: "final" },
    ],
  };
  expect(mergeLive(recorded, LOG).rounds.map((round) => round.map)).toEqual([
    "Wall Guys",
    "Hoverboard Heroes",
    "Roll Out",
    "Hex-A-Gone",
  ]);
});

test("winners survive the merge", () => {
  const recorded: Show = { name: "Solos 2", rounds: [], winners: ["Alpha"] };
  expect(mergeLive(recorded, LOG).winners).toEqual(["Alpha"]);
});
```

Add `mergeLive`, `LiveNow` and `Show` to the file's existing imports; keep everything else it already imports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/live.test.ts`
Expected: FAIL — `mergeLive` is not exported by `./live`.

- [ ] **Step 3: Implement**

Add to `src/live.ts`. It needs `Show` in the type import, so change the import line to:

```ts
import type { Round, RoundType, Show, TournamentEvent } from "./types";
```

Then append:

```ts
/**
 * The log and the admin each know half of the show being played: the log has every round the
 * moment it loads but never a name, the admin has the names but only once they are typed. This
 * lays the log under what has been recorded so the panel never has to choose.
 */
export function mergeLive(show: Show | undefined, now: LiveNow): Show {
  const rounds: Round[] = now.rounds.map((entry, index) => {
    const recorded = show?.rounds[index];
    if (!recorded) {
      return {
        map: entry.map,
        type: entry.type,
        ...(entry.qualified === undefined ? {} : { survivors: entry.qualified }),
      };
    }
    return recorded.survivors === undefined && entry.qualified !== undefined
      ? { ...recorded, survivors: entry.qualified }
      : recorded;
  });

  return {
    ...show,
    // Same rule as showNameNow: a recorded name sticks, the log's playlist only stands in.
    name: show?.name.trim() || now.show,
    rounds: [...rounds, ...(show?.rounds.slice(now.rounds.length) ?? [])],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/live.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/live.ts src/live.test.ts
git commit -m "feat: lay the log under what has been recorded for the live show"
```

---

## Task 3: Round badges render

**Files:**
- Modify: `site/show-field.ts`
- Test: `site/show-field.test.ts`

`renderShowField` is used only by `site/results.ts`, which stops calling it in Task 4. It goes now, together with its tests; `renderRoundBeans` replaces it.

- [ ] **Step 1: Write the failing tests**

In `site/show-field.test.ts`, change the import line to:

```ts
import { renderRoundBeans, renderShowNow } from "./show-field";
```

Delete these six tests (they exercise the removed `renderShowField`): `"every player in the field gets a chip"`, `"a chip carries its state as a class"`, `"a knocked-out chip says which round did it"`, `"rounds crossed first are marked on the chip"`, `"an empty roster renders nothing"`, `"a name is escaped"`.

Add `import { roundFieldsOf } from "../src/field";` to the imports at the top of the file. In
place of the deleted tests, above the `const LIVE: Show` block, add:

```ts
test("each badge carries its state as a class", () => {
  const rounds = roundFieldsOf(FINISHED, ROSTER);
  expect(renderRoundBeans(rounds[0]!)).toContain(`class="bn out"`);
  expect(renderRoundBeans(rounds[1]!)).toContain(`class="bn won"`);
});

test("a badge does not repeat the round it is sitting on", () => {
  expect(renderRoundBeans(roundFieldsOf(FINISHED, ROSTER)[0]!)).not.toContain("out R1");
});

test("rounds crossed first are marked on the badge", () => {
  const beans = roundFieldsOf(FINISHED, ROSTER)[1]!;
  expect(renderRoundBeans(beans)).toContain("⚡1");
});

test("a round that took nobody renders nothing", () => {
  expect(renderRoundBeans([])).toBe("");
});

test("a name is escaped", () => {
  const beans = roundFieldsOf(FINISHED, [{ fom: "X", ingame: "<script>" }]);
  const html = renderRoundBeans(beans[0]!);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});
```

Note `FINISHED` already has `first: "Alpha"` on round 1 and `winners: ["Alpha"]`, so Alpha is the crowned badge on the final and carries `⚡1`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test site/show-field.test.ts`
Expected: FAIL — `renderRoundBeans` is not exported by `./show-field`.

- [ ] **Step 3: Implement**

In `site/show-field.ts`, replace the `note`/`chip`/`renderShowField` block at the top with:

```ts
function outNote(player: FieldPlayer): string {
  if (player.outAt !== undefined) return `out R${player.outAt}`;
  return firstsNote(player);
}

function firstsNote(player: FieldPlayer): string {
  return player.firsts.length > 0 ? `⚡${player.firsts.join(" ⚡")}` : "";
}

function chip(player: FieldPlayer, detail: string): string {
  const crown = player.state === "won" ? "👑 " : "";
  return `<span class="bn ${player.state}">${crown}<b>${escapeHtml(player.ingame)}</b>${
    detail ? `<small>${detail}</small>` : ""
  }</span>`;
}

/** Badges for one round. The row already says which round it is, so the chips do not repeat it. */
export function renderRoundBeans(beans: FieldPlayer[]): string {
  if (beans.length === 0) return "";
  return `<div class="beans">${beans.map((p) => chip(p, firstsNote(p))).join("")}</div>`;
}
```

In `renderShowNow`, change the grid line to pass the note:

```ts
  const grid =
    field.length === 0
      ? ""
      : `<div class="beans">${field.map((p) => chip(p, outNote(p))).join("")}</div>`;
```

Drop `Show` from the type import if TypeScript reports it unused — `renderShowNow` still uses it in `tally`, so it should stay.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test site/show-field.test.ts`
Expected: PASS. `bun run typecheck` will still fail here because `site/results.ts` imports the deleted `renderShowField`; Task 4 fixes that.

- [ ] **Step 5: Commit**

```bash
git add site/show-field.ts site/show-field.test.ts
git commit -m "feat: render a round's badges without repeating the round"
```

---

## Task 4: One show render path

**Files:**
- Modify: `site/results.ts`
- Test: `site/results.test.ts`

- [ ] **Step 1: Write the failing tests**

In `site/results.test.ts`, delete these three tests, which asserted the old placeholder-only live box: `"the log alone is enough to list the show being played"`, `"the show being played carries the field like every other box"`, `"between rounds the show is still listed"`.

Replace them with:

```ts
test("the log alone is enough to list the show being played", () => {
  const html = renderResults([], ROSTER, NOW);
  expect(html).toContain("Roll Out");
  expect(html).toContain("Playing now");
});

test("nothing has been read for the show being played, so its field is still grey", () => {
  const html = renderResults([], ROSTER, NOW);
  // Three rounds, each greying the whole roster, because no board has been read for any of them.
  expect([...html.matchAll(/class="bn playing"/g)]).toHaveLength(ROSTER.length * NOW.rounds.length);
});

test("between rounds the rounds already loaded are still listed", () => {
  const html = renderResults([SOLOS], ROSTER, { ...NOW, map: null, type: null });
  expect(html).toContain("Playing now");
  expect(html).toContain("Wall Guys");
  expect(html).not.toContain("on screen");
});

test("a show with nothing loaded at all says it is waiting", () => {
  const html = renderResults([], ROSTER, { ...NOW, showNumber: 1, map: null, type: null, rounds: [] });
  expect(html).toContain("Loading the next round");
});
```

Rewrite `"a show panel colours the field"`. Per-round badges are only ever red, grey or gold —
green meant "got through the last board that was read", which is a whole-show state and has no
meaning inside a single round:

```ts
test("a show panel colours each round's badges", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toContain(`class="bn playing"`);
  expect(html).toContain(`class="bn out"`);
  expect(html).toContain(`class="bn won"`);
});
```

Then append the tests for the merge and the badges:

```ts
test("a first typed into the live show shows up next to its round", () => {
  const typed: Show = {
    name: "Solos 2",
    rounds: [{ map: "Wall Guys", type: "race", first: "Alpha", qualified: ["Alpha", "Bravo"] }],
  };
  const html = renderResults([SOLOS, typed], ROSTER, NOW);
  expect(html).toMatch(/Wall Guys[\s\S]*?Alpha/);
  expect(html).not.toMatch(/Wall Guys[\s\S]*?first not recorded/);
});

test("a round the log has loaded but nobody typed still appears on the live show", () => {
  const typed: Show = { name: "Solos 2", rounds: [{ map: "Wall Guys", type: "race" }] };
  const html = renderResults([SOLOS, typed], ROSTER, NOW);
  expect(html).toContain("Hoverboard Heroes");
});

test("the live show is drawn once, not once per source", () => {
  const typed: Show = { name: "Solos 2", rounds: [{ map: "Wall Guys", type: "race" }] };
  const html = renderResults([SOLOS, typed], ROSTER, NOW);
  expect([...html.matchAll(/Solos 2/g)]).toHaveLength(1);
});

test("a round reds the players it knocked out", () => {
  const html = renderResults([SOLOS], ROSTER);
  // Charlie is on nobody's board, so Dizzy Heights is where the roster lost them.
  expect(html).toMatch(/Roll Out[\s\S]*?bn out[\s\S]*?Charlie/);
});

test("the final crowns its winner and reds the finalist it beat", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toMatch(/Fall Mountain[\s\S]*?bn won[\s\S]*?Alpha/);
  expect(html).toMatch(/Fall Mountain[\s\S]*?bn out[\s\S]*?Bravo/);
});

test("a show no longer carries one field under all its rounds", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect([...html.matchAll(/class="beans"/g)]).toHaveLength(SOLOS.rounds.length);
});
```

`SOLOS` reads: round 1 `Dizzy Heights` has `first: "Alpha"` and no board, round 2 `Roll Out` qualifies Alpha and Bravo, round 3 `Fall Mountain` is the final won by Alpha. So round 1 greys all three, round 2 reds Charlie, the final crowns Alpha and reds Bravo.

Add `Show` to the type import at the top of the file if it is not already there:

```ts
import type { Player, Show } from "../src/types";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test site/results.test.ts`
Expected: FAIL — no per-round `.beans`, and the merged live-show tests find `Hoverboard Heroes` missing.

- [ ] **Step 3: Implement**

Replace the whole of `site/results.ts` with:

```ts
import { roundFieldsOf } from "../src/field";
import { mergeLive, type LiveNow } from "../src/live";
import type { Player, Round, Show } from "../src/types";
import { escapeHtml } from "./render";
import { renderRoundBeans } from "./show-field";

function winnerCell(round: Round, show: Show, onScreen: boolean): string {
  if (round.type === "final") {
    if (show.winners?.length) {
      return `<span class="winner">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`;
    }
    return onScreen
      ? `<span class="winner none">on screen</span>`
      : `<span class="winner none">—</span>`;
  }
  if (round.first) return `<span class="winner">${escapeHtml(round.first)}</span>`;
  if (onScreen) return `<span class="winner none">on screen</span>`;
  return round.type === "race"
    ? `<span class="winner missing">first not recorded</span>`
    : `<span class="winner none">no points</span>`;
}

/**
 * `onScreen` is the 1-based round the log says is being played, which only the machine running
 * Fall Guys knows; `null` means nothing is loaded, or nothing is speaking for this show.
 */
function renderShow(
  show: Show,
  number: number,
  live: boolean,
  onScreen: number | null,
  players: Player[],
): string {
  const beans = roundFieldsOf(show, players);
  const rounds = show.rounds
    .map(
      (round, index) => `
      <div class="rnd ${round.type === "final" ? "final" : ""}">
        <span class="i">${index + 1}</span>
        <span class="map">${escapeHtml(round.map)}</span>
        <span class="type"><span class="tag ${round.type}">${round.type}</span></span>
        ${winnerCell(round, show, index + 1 === onScreen)}
        ${round.survivors === undefined ? "" : `<span class="through">${round.survivors} through</span>`}
        ${renderRoundBeans(beans[index] ?? [])}
      </div>`,
    )
    .join("");

  const badge = show.winners?.length
    ? `<span class="champ">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`
    : live
      ? `<span class="champ playing">● Playing now</span>`
      : "";

  const body =
    show.rounds.length > 0
      ? `<div class="rounds">${rounds}</div>`
      : live
        ? `<p class="empty">Loading the next round…</p>`
        : `<div class="rounds"></div>`;

  return `
    <div class="${live ? "show live" : "show"}">
      <div class="panel">
        <header>
          <span class="num">${number}</span>
          <h3>${escapeHtml(show.name)}</h3>
          ${badge}
        </header>
        ${body}
      </div>
    </div>`;
}

export function renderResults(
  shows: Show[],
  players: Player[],
  now: LiveNow | null = null,
): string {
  // The log runs ahead of what has been typed in, so the show on screen may have no entry yet.
  // Clamping keeps it on the end of the list rather than dropping it when a show went unrecorded.
  const liveIndex =
    now === null ? -1 : Math.max(0, Math.min(now.showNumber - 1, shows.length));
  const panels = [...shows];
  if (now !== null) panels[liveIndex] = mergeLive(shows[liveIndex], now);

  if (panels.length === 0) return `<p class="empty">No shows played yet.</p>`;

  const onScreen = now !== null && now.map !== null ? now.rounds.length : null;
  const current = liveIndex >= 0 ? liveIndex : panels.length - 1;

  return panels
    .map((show, index) => {
      const live = index === current && !show.winners?.length;
      return renderShow(show, index + 1, live, live ? onScreen : null, players);
    })
    .reverse()
    .join("");
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `bun test site/results.test.ts && bun run typecheck`
Expected: PASS, and the typecheck reports no errors now that nothing imports `renderShowField`.

- [ ] **Step 5: Run the whole suite**

Run: `bun test`
Expected: the same 2 pre-existing failures in `src/ocr/fixtures.test.ts` (`qualified-board` and `playing` screen classification) and nothing else.

- [ ] **Step 6: Commit**

```bash
git add site/results.ts site/results.test.ts
git commit -m "feat: badge each round with who it knocked out"
```

---

## Task 5: Room for the badges

**Files:**
- Modify: `site/styles.css`

- [ ] **Step 1: Make the round row a two-line block**

In `site/styles.css`, after the `.rnd.final` rule, add:

```css
.rnd .beans { grid-column: 1 / -1; margin-top: 0.15rem; }
.rnd .beans .bn { font-size: 13px; padding: 0.18rem 0.55rem; }
```

- [ ] **Step 2: Give the badges their own row on narrow screens**

In the media query, replace the `.rnd` block and its area assignments with:

```css
  .rnd {
    grid-template-columns: 1.5rem 1fr auto;
    grid-template-areas: "i map type" "i winner winner" "beans beans beans";
    row-gap: 0.2rem;
  }
  .rnd .i { grid-area: i; }
  .rnd .map { grid-area: map; }
  .rnd .type { grid-area: type; }
  .rnd .winner { grid-area: winner; }
  .rnd .beans { grid-area: beans; }
```

- [ ] **Step 3: Look at it**

Run: `bun run dev`
Open the results page and confirm each round row carries its badges, the final's winner is gold with a crown, and the row does not scroll sideways at phone width.

- [ ] **Step 4: Commit**

```bash
git add site/styles.css
git commit -m "style: give each round row a badge line"
```

---

## Notes on behaviour that changes

| Before | After |
|--------------------------------------------------|------------------------------------------------------|
| Between rounds the live box hid its round list behind `Loading the next round…` | The round list stays; the message is only for a show with no rounds at all |
| A partially recorded live show ignored the log entirely | Rounds the log has loaded past what was typed are appended |
| Every show carried one bean field under its rounds | Beans sit inside the rounds; `renderShowField` is gone |
| The dashboard's `renderShowNow` panel | Unchanged — still the flat `fieldOf` grid with `out RN` notes |
