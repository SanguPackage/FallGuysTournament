import { expect, test } from "bun:test";
import type { LiveStatus } from "../src/live";
import type { Player, Show, TournamentEvent } from "../src/types";
import { roundFieldsOf } from "../src/field";
import { renderRoundBeans, renderShowNow } from "./show-field";

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

test("each badge carries its state as a class", () => {
  const rounds = roundFieldsOf(FINISHED, ROSTER);
  expect(renderRoundBeans(rounds[0]!)).toContain(`class="bn out"`);
  expect(renderRoundBeans(rounds[1]!)).toContain(`class="bn won"`);
});

test("a badge does not repeat the round it is sitting on", () => {
  expect(renderRoundBeans(roundFieldsOf(FINISHED, ROSTER)[0]!)).not.toContain("out R1");
});

test("rounds crossed first are marked on the badge", () => {
  expect(renderRoundBeans(roundFieldsOf(FINISHED, ROSTER)[1]!)).toContain("⚡1");
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
