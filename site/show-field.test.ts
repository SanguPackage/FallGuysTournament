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

const SHARED: Show = { ...FINISHED, winners: ["Alpha", "Bravo"] };

test("each badge carries its state as a class", () => {
  const rounds = roundFieldsOf(SHARED, ROSTER);
  expect(renderRoundBeans(rounds[0]!)).toContain(`class="bn out"`);
  expect(renderRoundBeans(rounds[0]!)).toContain(`class="bn through"`);
  expect(renderRoundBeans(rounds[1]!)).toContain(`class="bn won"`);
});

test("a badge does not repeat the round it is sitting on", () => {
  expect(renderRoundBeans(roundFieldsOf(FINISHED, ROSTER)[0]!)).not.toContain("out R1");
});

test("the bean who crossed first wears a winner badge", () => {
  const html = renderRoundBeans(roundFieldsOf(FINISHED, ROSTER)[0]!);
  expect(html).toContain(`<span class="bn through first">⚡ <b>Alpha</b>`);
  expect([...html.matchAll(/bn through first/g)]).toHaveLength(1);
});

test("a crown level rides along as a pill, and no pill without one", () => {
  const roster: Player[] = [
    { fom: "Alpha_FOM", ingame: "Alpha", crownRank: 50 },
    { fom: "Bravo_FOM", ingame: "Bravo" },
  ];
  const html = renderRoundBeans(roundFieldsOf(FINISHED, roster)[0]!);
  expect(html).toContain(`👑50</span>`);
  expect([...html.matchAll(/class="rank"/g)]).toHaveLength(1);
});

test("a crown pill carries the crowns it stands for", () => {
  const roster: Player[] = [{ fom: "Alpha_FOM", ingame: "Alpha", crownRank: 45 }];
  const html = renderRoundBeans(roundFieldsOf(FINISHED, roster)[0]!);
  expect(html).toContain(`title="Crown level 45 \u00b7 474\u2013503 crowns"`);
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
