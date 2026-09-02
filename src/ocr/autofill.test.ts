import { expect, test } from "bun:test";
import { fillsFor } from "./autofill";
import type { PlacedShot } from "../screenshots";
import type { ShotRead } from "./read";

const ROSTER = ["Diego_9942", "Serxav_9", "BigMooseLips"];

function shot(file: string, extra: Partial<PlacedShot> = {}): PlacedShot {
  return { file, takenAt: 0, source: "sharex", showIndex: 0, ...extra };
}

test("a board read after the round before the final becomes the finalists", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 2, namesFinalists: true })];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "finalists", names: ["Diego_9942", "Serxav_9"], from: "g.jpg" },
  ]);
});

test("a board read anywhere else names nobody, because only the final is scored", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 0 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([]);
});

test("the winner screen fills the winners", () => {
  const shots = [shot("w.jpg", { slot: "winners" })];
  const reads: Record<string, ShotRead> = {
    "w.jpg": { screen: "winner", tokens: ["R- Diego_9942"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "winners", names: ["Diego_9942"], from: "w.jpg" },
  ]);
});

test("the toast fills the round it was taken in", () => {
  const shots = [shot("t.jpg", { slot: "round", roundIndex: 1 })];
  const reads: Record<string, ShotRead> = { "t.jpg": { screen: "toast", tokens: ["-Serxav 9"] } };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "first", roundIndex: 1, names: ["Serxav_9"], from: "t.jpg" },
  ]);
});

test("a capture placed in no show fills nothing", () => {
  const reads: Record<string, ShotRead> = {
    "x.jpg": { screen: "winner", tokens: ["Diego_9942"] },
  };
  expect(fillsFor([{ file: "x.jpg", takenAt: 0, source: "sharex" }], reads, ROSTER)).toEqual([]);
});
