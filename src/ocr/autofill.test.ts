import { expect, test } from "bun:test";
import { fillsFor } from "./autofill";
import type { PlacedShot } from "../screenshots";
import type { ShotRead } from "./read";

const ROSTER = ["Diego_9942", "Serxav_9", "BigMooseLips"];

function shot(file: string, extra: Partial<PlacedShot> = {}): PlacedShot {
  return { file, takenAt: 0, showIndex: 0, ...extra };
}

test("a board read after the round before the final names the finalists", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 2, namesFinalists: true })];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    {
      showIndex: 0,
      slot: "qualified",
      roundIndex: 2,
      names: ["Diego_9942", "Serxav_9"],
      from: "g.jpg",
    },
  ]);
});

test("a board read after any other round names that round's survivors", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 0 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "qualified", roundIndex: 0, names: ["Diego_9942"], from: "g.jpg" },
  ]);
});

test("a board caught during the final belongs to no round, so it fills nothing", () => {
  const shots = [shot("g.jpg", { slot: "finalists" })];
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
  expect(fillsFor([{ file: "x.jpg", takenAt: 0 }], reads, ROSTER)).toEqual([]);
});
