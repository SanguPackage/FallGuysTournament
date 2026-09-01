import { expect, test } from "bun:test";
import { placeShots, shotsForSlot, type Shot } from "./screenshots";
import type { ParsedShow } from "./log";

const DATE = "2026-09-01";

function at(clock: string, dayOffset = 0): number {
  return new Date(`${DATE}T${clock}`).getTime() + dayOffset * 86_400_000;
}

function round(id: string, startedAt: string | undefined, isFinal = false) {
  return {
    id,
    ...(startedAt === undefined ? {} : { startedAt }),
    isFinal,
    timedOut: false,
    present: [],
    qualified: [],
    eliminated: [],
  };
}

const SHOWS: ParsedShow[] = [
  {
    showId: "solos",
    startedAt: "20:25:02",
    rounds: [round("hexsnake", "20:25:05"), round("floor_fall", "20:25:39", true)],
    winnerId: 3,
    wonAt: "20:27:15",
  },
  {
    showId: "roll_call",
    startedAt: "20:30:00",
    rounds: [round("dizzy_heights", "20:30:05")],
  },
];

function place(clock: string, dayOffset = 0, shows = SHOWS) {
  const shot: Shot = { file: "a.png", takenAt: at(clock, dayOffset) };
  return placeShots([shot], shows, DATE)[0]!;
}

test("a capture during a race round is filed under that round", () => {
  expect(place("20:25:20")).toMatchObject({ showIndex: 0, slot: "round", roundIndex: 0 });
});

test("a capture during the final is filed under the finalists", () => {
  expect(place("20:26:00")).toMatchObject({ showIndex: 0, slot: "finalists" });
});

test("a capture after the victory scene is filed under the winners", () => {
  expect(place("20:27:30")).toMatchObject({ showIndex: 0, slot: "winners" });
});

test("the winner window runs until the next show starts", () => {
  expect(place("20:29:59")).toMatchObject({ showIndex: 0, slot: "winners" });
  expect(place("20:30:01")).toMatchObject({ showIndex: 1, slot: "show" });
});

test("a capture inside a show but outside every round is filed under the show", () => {
  expect(place("20:25:03")).toMatchObject({ showIndex: 0, slot: "show" });
});

test("a capture before the first show belongs to nothing", () => {
  const placed = place("19:00:00");
  expect(placed.showIndex).toBeUndefined();
  expect(placed.slot).toBeUndefined();
});

test("the last show stays open, so captures during it are still filed", () => {
  expect(place("21:00:00")).toMatchObject({ showIndex: 1, slot: "round", roundIndex: 0 });
});

test("a log running past midnight rolls the day over", () => {
  const shows: ParsedShow[] = [
    { ...SHOWS[0]!, startedAt: "23:59:00", rounds: [round("hexsnake", "23:59:30")], wonAt: "00:01:00" },
  ];
  expect(place("00:00:30", 1, shows)).toMatchObject({ slot: "round", roundIndex: 0 });
  expect(place("00:02:00", 1, shows)).toMatchObject({ slot: "winners" });
});

test("a round the log left unstamped falls through to the show rather than guessing", () => {
  const shows: ParsedShow[] = [
    { showId: "solos", startedAt: "20:25:02", rounds: [round("hexsnake", undefined)] },
  ];
  expect(place("20:26:00", 0, shows)).toMatchObject({ showIndex: 0, slot: "show" });
});

test("captures come back in the order they were taken", () => {
  const shots: Shot[] = [
    { file: "late.png", takenAt: at("20:26:00") },
    { file: "early.png", takenAt: at("20:25:20") },
  ];
  expect(placeShots(shots, SHOWS, DATE).map((shot) => shot.file)).toEqual([
    "early.png",
    "late.png",
  ]);
});

const PLACED = placeShots(
  [
    { file: "race.png", takenAt: at("20:25:20") },
    { file: "final.png", takenAt: at("20:26:00") },
    { file: "win.png", takenAt: at("20:27:30") },
    { file: "idle.png", takenAt: at("20:25:03") },
    { file: "desktop.png", takenAt: at("19:00:00") },
  ],
  SHOWS,
  DATE,
);

test("a round slot picks only that round's captures", () => {
  expect(shotsForSlot(PLACED, 0, { slot: "round", roundIndex: 0 }).map((s) => s.file)).toEqual([
    "race.png",
  ]);
});

test("the finalists and winners slots pick their own", () => {
  expect(shotsForSlot(PLACED, 0, { slot: "finalists" }).map((s) => s.file)).toEqual(["final.png"]);
  expect(shotsForSlot(PLACED, 0, { slot: "winners" }).map((s) => s.file)).toEqual(["win.png"]);
});

test("the show slot picks everything of that show that no round claimed", () => {
  expect(shotsForSlot(PLACED, 0, { slot: "show" }).map((s) => s.file)).toEqual(["idle.png"]);
});

test("a whole show picks everything of it, whatever slot it landed in", () => {
  expect(shotsForSlot(PLACED, 0, { slot: "all" }).map((s) => s.file)).toEqual([
    "idle.png",
    "race.png",
    "final.png",
    "win.png",
  ]);
});

test("the unmatched slot picks what belongs to no show at all", () => {
  expect(shotsForSlot(PLACED, 0, { slot: "unmatched" }).map((s) => s.file)).toEqual([
    "desktop.png",
  ]);
});
