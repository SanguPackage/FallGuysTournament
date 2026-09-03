import { expect, test } from "bun:test";
import type { LiveStatus } from "../src/live";
import type { LeaderboardRow } from "../src/types";
import { renderField, renderPodium, renderStandings, renderStatus } from "./render";
import type { ShowInOrder } from "./rules";

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

const FIELD = [
  row({ fom: "Ann", ingame: "Alpha", points: 9 }),
  row({ fom: "Bob", ingame: "Bravo", points: 7 }),
  row({ fom: "Cid", ingame: "Charlie", points: 5 }),
  row({ fom: "Dee", ingame: "Delta", points: 3 }),
  row({ fom: "Eve", ingame: "Echo", points: 1 }),
];

const ORDER: ShowInOrder[] = [
  { position: 1, show: "Solos", tier: "Opening", min: 2, max: 32 },
  { position: 2, show: "Fan Favourites", tier: "Opening", min: 5, max: 32 },
];

/* ---------------------------------------------------------------- podium */

test("the podium shows second, first and third in that order", () => {
  const html = renderPodium(FIELD);
  const names = [...html.matchAll(/class="nm">([^<]+)</g)].map((m) => m[1]);
  expect(names).toEqual(["Bob", "Ann", "Cid"]);
});

test("only the podium winner is crowned", () => {
  expect([...renderPodium(FIELD).matchAll(/class="crown"/g)]).toHaveLength(1);
});

test("a podium with fewer than three players renders only who is there", () => {
  const html = renderPodium(FIELD.slice(0, 2));
  expect([...html.matchAll(/class="p /g)]).toHaveLength(2);
  expect(html).toContain("Ann");
  expect(html).toContain("Bob");
});

test("an empty field renders a message rather than a podium", () => {
  expect(renderPodium([])).toContain("No players registered");
});

test("players level on points share a podium rank", () => {
  const html = renderPodium([
    row({ fom: "Ann", points: 9 }),
    row({ fom: "Bob", points: 9 }),
    row({ fom: "Cid", points: 4 }),
  ]);
  const ranks = [...html.matchAll(/class="rk">(\d+)</g)].map((m) => m[1]);
  expect(ranks).toEqual(["1", "1", "3"]);
});

/* ----------------------------------------------------------------- field */

test("the field is everyone below the podium", () => {
  const html = renderField(FIELD);
  expect(html).toContain("Dee");
  expect(html).toContain("Eve");
  expect(html).not.toContain("Ann");
});

test("a field of three or fewer renders nothing", () => {
  expect(renderField(FIELD.slice(0, 3))).toBe("");
});

test("players who just scored are marked as movers", () => {
  const cards = renderField(FIELD, new Set(["Dee"])).split(`<div class="card`).slice(1);
  expect(cards[0]).toContain("Dee");
  expect(cards[0]).toContain("up");
  expect(cards[1]).toContain("Eve");
  expect(cards[1]).not.toContain("up");
});

/* ------------------------------------------------------------- standings */

test("the standings list everyone, podium included", () => {
  const html = renderStandings(FIELD);
  expect([...html.matchAll(/class="row[ "]/g)]).toHaveLength(5);
  expect(html).toContain("Ann");
  expect(html).toContain("Eve");
});

test("the standings show each player's races, finals and wins", () => {
  const html = renderStandings([row({ fom: "Ann", raceWins: 2, finalsReached: 4, finalsWon: 1 })]);
  const stats = [...html.matchAll(/<b>(\d+)<\/b><span>/g)].map((m) => m[1]);
  expect(stats).toEqual(["2", "4", "1"]);
});

test("a penalty is spelled out under the name", () => {
  const html = renderStandings([row({ fom: "Ann", points: 4, penaltyPoints: -2 })]);
  expect(html).toContain("-2");
});

test("a crown rank is shown beside the in-game name", () => {
  const html = renderStandings([row({ fom: "Ann", ingame: "Alpha", crownRank: 50 })]);
  expect(html).toContain("\u{1F451}50");
});

test("a player who never reported a crown rank gets no crown at all", () => {
  expect(renderStandings([row({ fom: "Ann" })])).not.toContain("crown-rank");
});

test("a player with no in-game name yet is marked as pending", () => {
  expect(renderStandings([row({ fom: "Ann", ingame: undefined })])).toContain("pending");
});

test("every row opens that player's details", () => {
  const html = renderStandings([row({ fom: "Ann", ingame: "Alpha" })]);
  expect(html).toContain(`data-player="Ann"`);
  expect(html).toContain("open-player");
});

test("a player with no in-game name has nothing to open", () => {
  const html = renderStandings([row({ fom: "Ann", ingame: undefined })]);
  expect(html).not.toContain("open-player");
});

test("names are escaped", () => {
  const html = renderStandings([row({ fom: "<script>", ingame: "A&B" })]);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("A&amp;B");
});

/* ---------------------------------------------------------------- status */

function status(overrides: Partial<LiveStatus>): LiveStatus {
  return { state: "playing", orderIndex: 0, ...overrides };
}

test("before the first show the status says so and names what is up first", () => {
  const html = renderStatus(status({ state: "not-started", orderIndex: -1, nextShow: "Solos" }), ORDER);
  expect(html).toContain("Not started yet");
  expect(html).toContain("Solos");
});

test("a show in progress names the show, its number and the round being played", () => {
  const html = renderStatus(
    status({ showName: "Solos", showNumber: 1, round: 3, lastRound: { map: "Whirlygig", type: "race", first: "Alpha" } }),
    ORDER,
  );
  expect(html).toContain("Solos");
  expect(html).toContain("Show 1");
  expect(html).toContain("Round 3");
  expect(html).toContain("Whirlygig");
  expect(html).toContain("Alpha");
});

test("between shows there is no round, only what is up next", () => {
  const html = renderStatus(
    status({ state: "between", showName: "Solos", showNumber: 1, nextShow: "Fan Favourites" }),
    ORDER,
  );
  expect(html).not.toContain("Round");
  expect(html).toContain("Fan Favourites");
});

test("what is up next is shown mid-show too, not only between shows", () => {
  const html = renderStatus(
    status({ showName: "Solos", showNumber: 1, round: 2, nextShow: "Fan Favourites" }),
    ORDER,
  );
  expect(html).toContain("Round 2");
  expect(html).toContain("Fan Favourites");
});

test("after the last show nothing is up next", () => {
  const html = renderStatus(status({ state: "between", showName: "Solos", showNumber: 1 }), ORDER);
  expect(html).toContain("That was the last one");
});

test("one pip per show in the order, with the current show lit", () => {
  const html = renderStatus(status({ orderIndex: 1, showName: "Fan Favourites", showNumber: 2, round: 1 }), ORDER);
  expect([...html.matchAll(/class="pip[ "]/g)]).toHaveLength(2);
  expect(html).toContain(`class="pip done"`);
  expect(html).toContain(`class="pip now"`);
});
