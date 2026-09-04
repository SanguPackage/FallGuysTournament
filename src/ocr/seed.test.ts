import { expect, test } from "bun:test";
import { seededRoster } from "./seed";
import type { PlacedShot } from "../screenshots";
import type { ShotRead } from "./read";
import type { Player } from "../types";

function shot(file: string, extra: Partial<PlacedShot> = {}): PlacedShot {
  return { file, takenAt: 0, source: "sharex", showIndex: 0, roundIndex: 0, ...extra };
}

const ADMIN: Player = { ingame: "AnotherAccount58", fom: "Wouter_Van_Schandevijl", admin: true };

test("a roster with nobody registered takes its players off the first board", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([
    { ingame: "Diego_9942" },
    { ingame: "Serxav_9" },
  ]);
});

test("the admin keeps their row and their fields", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([ADMIN], shots, reads)).toEqual([ADMIN, { ingame: "Diego_9942" }]);
});

test("one registered player is enough to leave the roster alone", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([{ ingame: "BigMooseLips" }], shots, reads)).toBeUndefined();
});

test("a player who registered and then withdrew still counts as a roster", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([{ ingame: "BigMooseLips", joined: false }], shots, reads)).toBeUndefined();
});

test("a row still being typed in is not a registered player", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([ADMIN, { ingame: "" }], shots, reads)).toEqual([
    ADMIN,
    { ingame: "" },
    { ingame: "Diego_9942" },
  ]);
});

test("a board off a later round is not the first board", () => {
  const shots = [shot("g.jpg", { roundIndex: 2 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("a board off a later show is not the first board", () => {
  const shots = [shot("g.jpg", { showIndex: 1 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("the board before it settles names everyone still in, so it is not read", () => {
  const shots = [shot("f.jpg")];
  const reads: Record<string, ShotRead> = { "f.jpg": { screen: "field", tokens: ["Diego_9942"] } };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("a capture nobody has read yet seeds nothing", () => {
  expect(seededRoster([], [shot("g.jpg")], {})).toBeUndefined();
});

test("a board that read no names seeds nothing", () => {
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: [] } };
  expect(seededRoster([], [shot("g.jpg")], reads)).toBeUndefined();
});

test("two captures of the same board give the roster the fuller read", () => {
  const shots = [shot("early.jpg", { takenAt: 10 }), shot("late.jpg", { takenAt: 20 })];
  const reads: Record<string, ShotRead> = {
    "early.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9", "BigMooseLips"] },
    "late.jpg": { screen: "grid", tokens: ["Diego_9942"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([
    { ingame: "Diego_9942" },
    { ingame: "Serxav_9" },
    { ingame: "BigMooseLips" },
  ]);
});

test("two reads of the same size go with the later capture", () => {
  const shots = [shot("early.jpg", { takenAt: 10 }), shot("late.jpg", { takenAt: 20 })];
  const reads: Record<string, ShotRead> = {
    "early.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "late.jpg": { screen: "grid", tokens: ["Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([{ ingame: "Serxav_9" }]);
});
