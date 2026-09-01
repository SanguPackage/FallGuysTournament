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
