import { expect, test } from "bun:test";
import {
  addPenalty,
  addRound,
  addShow,
  closeShow,
  currentShow,
  resolvePlayer,
  ValidationError,
} from "./event";
import type { Players, TournamentEvent } from "./types";

const players: Players = {
  players: [
    { ingame: "Alpha", fom: "Ann" },
    { ingame: "Bravo", fom: "Bob" },
  ],
};

function emptyEvent(): TournamentEvent {
  return { name: "FOM", date: "2026-09-01", shows: [], penalties: [] };
}

test("resolvePlayer matches an in-game name case-insensitively", () => {
  expect(resolvePlayer(players, "alpha")).toBe("Alpha");
  expect(resolvePlayer(players, "  Alpha ")).toBe("Alpha");
});

test("resolvePlayer rejects an unknown name and suggests near matches", () => {
  expect(() => resolvePlayer(players, "Alp")).toThrow(ValidationError);
  expect(() => resolvePlayer(players, "Alp")).toThrow(/Alpha/);
});

test("currentShow rejects recording anything before a show is started", () => {
  expect(() => currentShow(emptyEvent())).toThrow(ValidationError);
});

test("addShow appends a show and makes it current", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  expect(event.shows).toHaveLength(1);
  expect(currentShow(event).name).toBe("Solos");
});

test("addRound appends to the current show", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Dizzy Heights", type: "race", first: "Alpha" });
  expect(currentShow(event).rounds).toEqual([
    { map: "Dizzy Heights", type: "race", first: "Alpha" },
  ]);
});

test("closeShow records the final round, its finalists and its winners", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, {
    map: "Fall Mountain",
    finalists: ["Alpha", "Bravo"],
    winners: ["Alpha"],
  });
  const show = currentShow(event);
  expect(show.rounds).toEqual([
    { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
    { map: "Fall Mountain", type: "final" },
  ]);
  expect(show.winners).toEqual(["Alpha"]);
});

test("closeShow accepts an empty winners list for a timed-out final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, { map: "Hex-A-Gone", finalists: ["Alpha"], winners: [] });
  expect(currentShow(event).winners).toEqual([]);
});

test("closeShow rejects a winner who did not reach the final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  expect(() =>
    closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Bravo"] }),
  ).toThrow(ValidationError);
});

test("closeShow rejects a show with no round before its final", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  expect(() =>
    closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] }),
  ).toThrow(ValidationError);
});

test("closeShow rejects a show that is already closed", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] });
  expect(() =>
    closeShow(event, { map: "Hex-A-Gone", finalists: ["Bravo"], winners: ["Bravo"] }),
  ).toThrow(ValidationError);
});

test("addRound rejects a show that is already closed", () => {
  const event = emptyEvent();
  addShow(event, "Solos");
  addRound(event, { map: "Roll Out", type: "survival" });
  closeShow(event, { map: "Fall Mountain", finalists: ["Alpha"], winners: ["Alpha"] });
  expect(() => addRound(event, { map: "Tip Toe", type: "race", first: "Alpha" })).toThrow(
    ValidationError,
  );
});

test("addPenalty appends to the event", () => {
  const event = emptyEvent();
  addPenalty(event, { ingame: "Alpha", points: -2, reason: "collaboration" });
  expect(event.penalties).toEqual([
    { ingame: "Alpha", points: -2, reason: "collaboration" },
  ]);
});
