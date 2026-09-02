import { expect, test } from "bun:test";
import type { LiveStatus } from "../src/live";
import type { Player, Show, TournamentEvent } from "../src/types";
import { renderShowField, renderShowNow } from "./show-field";

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
