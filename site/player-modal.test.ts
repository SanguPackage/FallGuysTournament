import { expect, test } from "bun:test";
import type { PlayerDetail, ShowLine } from "../src/player-detail";
import type { LeaderboardRow } from "../src/types";
import { renderPlayerModal } from "./player-modal";

function row(overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    ingame: "Alpha",
    fom: "Ann",
    points: 9,
    raceWins: 1,
    finalsReached: 1,
    finalsWon: 1,
    penaltyPoints: 0,
    ...overrides,
  };
}

function line(overrides: Partial<ShowLine> = {}): ShowLine {
  return {
    number: 1,
    name: "Solos 1",
    placing: "won",
    points: 9,
    cells: [
      { state: "first", map: "Tundra Run", type: "race" },
      { state: "through", map: "Hoop Chute", type: "hunt" },
      { state: "won", map: "Hex-A-Gone", type: "final" },
    ],
    ...overrides,
  };
}

function detail(overrides: Partial<PlayerDetail> = {}): PlayerDetail {
  return { row: row(), shows: [line()], ...overrides };
}

/** The cells of each show row, as `[state, mark]`. The header row and the legend carry neither. */
function gridCells(html: string): [string, string][][] {
  return [...html.matchAll(/<div class="gr (?!head)[^"]*">(.*?)<\/div>/gs)].map((row) =>
    [...row[1]!.matchAll(/class="c (\w+)"[^>]*>([^<]*)</g)].map((c) => [c[1]!, c[2]!]),
  );
}

test("the header names the player both ways", () => {
  const html = renderPlayerModal(detail());
  expect(html).toContain("Alpha");
  expect(html).toContain("Ann");
});

test("a crown rank is shown, and left out when nobody typed one in", () => {
  expect(renderPlayerModal(detail({ row: row({ crownRank: 12 }) }))).toContain("👑12");
  expect(renderPlayerModal(detail())).not.toContain("crown-rank");
});

test("a player who never reported an in-game name says so", () => {
  const html = renderPlayerModal(detail({ row: row({ ingame: undefined }) }));
  expect(html).toContain("no in-game name yet");
});

test("the penalty tile appears only when a penalty was given", () => {
  expect(renderPlayerModal(detail())).not.toContain("Penalty");
  const punished = detail({ row: row({ penaltyPoints: -2 }) });
  expect(renderPlayerModal(punished)).toContain("Penalty");
  expect(renderPlayerModal(punished)).toContain("-2");
});

test("each cell state gets its own mark", () => {
  const html = renderPlayerModal(
    detail({
      shows: [
        line({
          cells: [
            { state: "first", map: "A", type: "race" },
            { state: "through", map: "B", type: "hunt" },
            { state: "out", map: "C", type: "survival" },
            { state: "unknown", map: "D", type: "logic" },
            { state: "won", map: "E", type: "final" },
          ],
        }),
      ],
    }),
  );
  expect(gridCells(html)[0]).toEqual([
    ["first", "⚡"],
    ["through", "✓"],
    ["out", "✗"],
    ["unknown", "?"],
    ["won", "👑"],
  ]);
});

test("a cell names its map and type, so hovering reads the show back", () => {
  const html = renderPlayerModal(detail());
  expect(html).toContain('title="Tundra Run — race"');
});

test("a cell nobody read a board for says why it is blank", () => {
  const html = renderPlayerModal(
    detail({ shows: [line({ cells: [{ state: "unknown", map: "Big Shots", type: "survival" }] })] }),
  );
  expect(html).toContain("no qualification board");
});

test("shows are padded to the longest, so the round columns line up", () => {
  const html = renderPlayerModal(
    detail({
      shows: [
        line({ cells: [{ state: "out", map: "A", type: "race" }] }),
        line({ number: 2, name: "Solos 2" }),
      ],
    }),
  );
  expect(gridCells(html).map((cells) => cells.length)).toEqual([3, 3]);
});

test("each placing gets its badge", () => {
  const placings = ["won", "finalist", "playing", "contestant"] as const;
  const html = renderPlayerModal(
    detail({ shows: placings.map((placing, at) => line({ number: at + 1, placing })) }),
  );
  const badges = [...html.matchAll(/class="badge \w+">([^<]+)</g)].map((m) => m[1]!.trim());
  expect(badges).toEqual(["👑 Winner", "Finalist", "Still in", "Contestant"]);
});

test("a show worth nothing shows a zero rather than a plus", () => {
  const html = renderPlayerModal(detail({ shows: [line({ points: 0 }), line({ number: 2 })] }));
  const points = [...html.matchAll(/class="pt">([^<]+)</g)].map((m) => m[1]!.trim());
  expect(points).toEqual(["0", "+9"]);
});

test("an event nobody has played yet says so instead of drawing an empty grid", () => {
  expect(renderPlayerModal(detail({ shows: [] }))).toContain("No shows played yet");
});

test("names and maps are escaped", () => {
  const html = renderPlayerModal(
    detail({
      row: row({ fom: "<script>", ingame: "A&B" }),
      shows: [line({ name: '"quoted"', cells: [{ state: "out", map: "<map>", type: "race" }] })],
    }),
  );
  expect(html).not.toContain("<script>");
  expect(html).toContain("A&amp;B");
  expect(html).toContain("&quot;quoted&quot;");
  expect(html).toContain("&lt;map&gt;");
});
