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

test("a player with no in-game name yet renders a placeholder", () => {
  const html = renderLeaderboard([row({ fom: "Ann", ingame: undefined })]);
  expect(html).toContain("Ann");
  expect(html).toContain(`<span class="ingame">—</span>`);
});
