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
  expect(rows.map((r) => r.ingame)).toEqual(["Charlie", "Bravo", "Alpha"]);
});

test("players level on every criterion are ordered by FOM name", () => {
  const rows = score(emptyEvent(), players);
  expect(rows.map((r) => r.ingame)).toEqual(["Alpha", "Bravo", "Charlie"]);
});

const roster: Players = {
  players: [
    { ingame: "Alpha", fom: "Ann" },
    { fom: "Bob" },
    { fom: "Cas" },
  ],
};

test("players with no in-game name yet still appear, on zero", () => {
  const rows = score(emptyEvent(), roster);
  expect(rows.map((r) => r.fom)).toEqual(["Ann", "Bob", "Cas"]);
  expect(rows.every((r) => r.points === 0)).toBe(true);
});

test("two players with no in-game name do not collapse into one row", () => {
  const rows = score(emptyEvent(), roster);
  expect(rows.filter((r) => r.ingame === undefined)).toHaveLength(2);
});

test("scoring still reaches a player through their in-game name", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", first: "Alpha" }],
  });
  const rows = score(event, roster);
  expect(rows.find((r) => r.fom === "Ann")!.points).toBe(3);
});

const withAdmin: Players = {
  players: [
    { ingame: "Alpha", fom: "Ann" },
    { ingame: "Ref", fom: "Wouter", admin: true },
  ],
};

test("the admin is left off the leaderboard", () => {
  const rows = score(emptyEvent(), withAdmin);
  expect(rows.map((r) => r.fom)).toEqual(["Ann"]);
});

test("results recorded against the admin score nothing", () => {
  const event = emptyEvent();
  event.shows.push({
    name: "Solos",
    finalists: ["Ref", "Alpha"],
    winners: ["Ref"],
    rounds: [{ map: "Dizzy Heights", type: "race", first: "Ref" }],
  });
  const rows = score(event, withAdmin);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.fom).toBe("Ann");
  expect(rows[0]!.points).toBe(1);
});

test("a hunt round's first across the line scores like a race", () => {
  const event = emptyEvent();
  event.shows.push({ name: "Solos", rounds: [{ map: "Airtime", type: "hunt", first: "Alpha" }] });
  expect(pointsFor(score(event, players), "Alpha")).toBe(3);
});

test("a first recorded on a round nobody can finish first in scores nothing", () => {
  for (const type of ["survival", "logic", "team", "unknown"] as const) {
    const event = emptyEvent();
    event.shows.push({ name: "Solos", rounds: [{ map: "Roll Out", type, first: "Alpha" }] });
    expect(pointsFor(score(event, players), "Alpha")).toBe(0);
  }
});

test("a round with no first recorded scores nothing, whatever its type", () => {
  const event = emptyEvent();
  event.shows.push({ name: "Solos", rounds: [{ map: "Tail Tag", type: "hunt" }] });
  expect(pointsFor(score(event, players), "Alpha")).toBe(0);
});
