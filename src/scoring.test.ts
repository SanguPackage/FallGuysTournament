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
