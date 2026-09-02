import { expect, test } from "bun:test";
import { fillsFor } from "./autofill";
import type { PlacedShot, ShowTimes } from "../screenshots";
import type { ShotRead } from "./read";
import type { Show } from "../types";

const ROSTER = ["Diego_9942", "Serxav_9", "BigMooseLips"];

function shot(file: string, extra: Partial<PlacedShot> = {}): PlacedShot {
  return { file, takenAt: 0, source: "sharex", showIndex: 0, ...extra };
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
      matched: [true, true],
      from: "g.jpg",
    },
  ]);
});

test("a board read after any other round names that round's survivors", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 0 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "qualified", roundIndex: 0, names: ["Diego_9942"], matched: [true], from: "g.jpg" },
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
    { showIndex: 0, slot: "winners", names: ["Diego_9942"], matched: [true], from: "w.jpg" },
  ]);
});

test("the toast fills the round it was taken in", () => {
  const shots = [shot("t.jpg", { slot: "round", roundIndex: 1 })];
  const reads: Record<string, ShotRead> = { "t.jpg": { screen: "toast", tokens: ["-Serxav 9"] } };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "first", roundIndex: 1, names: ["Serxav_9"], matched: [true], from: "t.jpg" },
  ]);
});

test("a capture placed in no show fills nothing", () => {
  const reads: Record<string, ShotRead> = {
    "x.jpg": { screen: "winner", tokens: ["Diego_9942"] },
  };
  expect(fillsFor([{ file: "x.jpg", takenAt: 0, source: "sharex" }], reads, ROSTER)).toEqual([]);
});

/**
 * `fixtures/race-first/NOT-a-race-wanner.png` is this case: a capture from ten seconds before
 * anyone finished Chicken Gulch, its plate reading QUALIFIED 0/9. It carries a crowned name in the
 * pill column all the same, and reading it would award the round to a bean who went out.
 */
test("a capture from before the first qualifier names nobody first", () => {
  const shot: PlacedShot = {
    file: "NOT-a-race-wanner.png",
    takenAt: Date.parse("2026-09-02T01:47:32Z"),
    source: "sharex",
    showIndex: 0,
    slot: "round",
    roundIndex: 2,
  };
  const reads = { [shot.file]: { screen: "toast" as const, tokens: ["shalaby_nino"] } };
  const times: ShowTimes[] = [
    { rounds: [], firsts: [undefined, undefined, Date.parse("2026-09-02T01:47:42Z")], ends: [] },
  ];

  expect(fillsFor([shot], reads, ["shalaby_nino"], times)).toEqual([]);
  // The same capture ten seconds later is the real thing.
  expect(fillsFor([{ ...shot, takenAt: Date.parse("2026-09-02T01:47:44Z") }], reads, ["shalaby_nino"], times))
    .toHaveLength(1);
});

/**
 * Every player in the tournament is registered, so a name no roster entry claimed is one to look
 * at: either the reading is wrong or the roster is missing somebody.
 */
test("a fill says which of its names the roster claimed", () => {
  const shot: PlacedShot = {
    file: "board.jpg",
    takenAt: 1,
    source: "sharex",
    showIndex: 0,
    slot: "round",
    roundIndex: 0,
  };
  const reads = {
    "board.jpg": { screen: "grid" as const, tokens: ["Diego_9942", "RanidHives05"] },
  };

  const [fill] = fillsFor([shot], reads, ["Diego_9942", "Serxav_9"]);
  expect(fill!.names).toEqual(["Diego_9942", "RanidHives05"]);
  expect(fill!.matched).toEqual([true, false]);
});

const KNOCKED_OUT: Show = {
  name: "Solos",
  rounds: [
    { map: "Dizzy Heights", type: "race", qualified: ["Serxav_9", "BigMooseLips"] },
    { map: "Roll Out", type: "survival" },
  ],
  checked: true,
};

test("a show nobody has ticked off narrows nothing, since its boards are half read", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 1 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  const open = { ...KNOCKED_OUT, checked: undefined };
  expect(fillsFor(shots, reads, ROSTER, [], [open])[0]!.matched).toEqual([true]);
});

test("a name the boards of a ticked show already dropped is not offered for a later round", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 1 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(fillsFor(shots, reads, ROSTER, [], [KNOCKED_OUT])).toEqual([
    {
      showIndex: 0,
      slot: "qualified",
      roundIndex: 1,
      names: ["Diego_9942"],
      matched: [false],
      from: "g.jpg",
    },
  ]);
});

test("the winner screen is matched against whoever the last board left standing", () => {
  const shots = [shot("w.jpg", { slot: "winners" })];
  const reads: Record<string, ShotRead> = { "w.jpg": { screen: "winner", tokens: ["R- Diego_9942"] } };
  expect(fillsFor(shots, reads, ROSTER, [], [KNOCKED_OUT])[0]!.matched).toEqual([false]);
});
