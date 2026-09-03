import { expect, test } from "bun:test";
import { playerDetail } from "./player-detail";
import type { Players, Show, TournamentEvent } from "./types";

const PLAYERS: Players = {
  players: [
    { fom: "Alpha_FOM", ingame: "Alpha", crownRank: 12 },
    { fom: "Bravo_FOM", ingame: "Bravo" },
    { fom: "Charlie_FOM", ingame: "Charlie" },
    { fom: "Delta_FOM", ingame: "Delta" },
    { fom: "Unreported_FOM" },
  ],
};

/** Four rounds, boards on all but the final, Alpha crossing first on round 1. */
function played(name: string, winners?: string[]): Show {
  return {
    name,
    rounds: [
      { map: "Tundra Run", type: "race", first: "Alpha", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Hoop Chute", type: "hunt", qualified: ["Alpha", "Bravo"] },
      { map: "Hex-A-Gone", type: "final" },
    ],
    ...(winners === undefined ? {} : { winners }),
  };
}

function event(shows: Show[]): TournamentEvent {
  return { name: "FOM", date: "2026-09-02", shows, penalties: [] };
}

function detail(shows: Show[], fom: string) {
  return playerDetail(event(shows), PLAYERS, fom);
}

test("the header carries the player's names, crown rank and leaderboard totals", () => {
  const { row } = detail([played("Solos 1", ["Alpha"])], "Alpha_FOM");
  expect(row).toMatchObject({
    fom: "Alpha_FOM",
    ingame: "Alpha",
    crownRank: 12,
    raceWins: 1,
    finalsReached: 1,
    finalsWon: 1,
  });
});

test("a player nobody registered has no detail", () => {
  expect(playerDetail(event([]), PLAYERS, "Nobody_FOM")).toBeUndefined();
});

test("a winner's row reads Winner, and its final cell wears the crown", () => {
  const [show] = detail([played("Solos 1", ["Alpha"])], "Alpha_FOM")!.shows;
  expect(show).toMatchObject({ number: 1, name: "Solos 1", placing: "won" });
  expect(show!.cells.map((c) => c.state)).toEqual(["first", "through", "won"]);
});

test("through the round before a final is Finalist", () => {
  const [show] = detail([played("Solos 1", ["Alpha"])], "Bravo_FOM")!.shows;
  expect(show).toMatchObject({ placing: "finalist" });
  expect(show!.cells.map((c) => c.state)).toEqual(["through", "through", "out"]);
});

test("a name off a board is out, and every round after it is not theirs to play", () => {
  const [show] = detail([played("Solos 1", ["Alpha"])], "Charlie_FOM")!.shows;
  expect(show).toMatchObject({ placing: "contestant" });
  expect(show!.cells.map((c) => c.state)).toEqual(["through", "out", "none"]);
});

test("out on round one is a contestant, not a finalist", () => {
  const [show] = detail([played("Solos 1", ["Alpha"])], "Delta_FOM")!.shows;
  expect(show).toMatchObject({ placing: "contestant" });
  expect(show!.cells.map((c) => c.state)).toEqual(["out", "none", "none"]);
});

test("a round nobody read a board for claims nothing", () => {
  const show: Show = {
    name: "Solos 1",
    rounds: [
      { map: "Big Shots", type: "survival" },
      { map: "Blast Ball", type: "final" },
    ],
  };
  const [line] = detail([show, played("Solos 2")], "Alpha_FOM")!.shows;
  expect(line!.cells.map((c) => c.state)).toEqual(["unknown", "unknown"]);
});

test("only the last show can still be holding anyone", () => {
  const open: Show = { name: "Solos", rounds: [{ map: "Big Shots", type: "survival" }] };
  const shows = detail([open, open], "Alpha_FOM")!.shows;
  expect(shows.map((s) => s.placing)).toEqual(["contestant", "playing"]);
});

test("a cell knows its map and type, so the grid can name what it is", () => {
  const [show] = detail([played("Solos 1")], "Alpha_FOM")!.shows;
  expect(show!.cells[0]).toMatchObject({ map: "Tundra Run", type: "race" });
  expect(show!.cells[2]).toMatchObject({ map: "Hex-A-Gone", type: "final" });
});

test("a show's points are its race wins, its final and its win", () => {
  const shows = detail([played("Solos 1", ["Alpha"])], "Alpha_FOM")!.shows;
  expect(shows[0]!.points).toBe(9);
});

test("a shared win splits the show's five points", () => {
  const shows = detail([played("Solos 1", ["Alpha", "Bravo"])], "Bravo_FOM")!.shows;
  expect(shows[0]!.points).toBe(3);
});

test("a show that gave a player nothing is worth nothing", () => {
  const shows = detail([played("Solos 1", ["Alpha"])], "Delta_FOM")!.shows;
  expect(shows[0]!.points).toBe(0);
});

test("every show is listed, whether the player was in it or not", () => {
  const shows = detail([played("Solos 1"), played("Solos 2")], "Delta_FOM")!.shows;
  expect(shows.map((s) => s.name)).toEqual(["Solos 1", "Solos 2"]);
});
