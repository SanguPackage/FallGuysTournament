// The log writes UTC while the event runs on Belgian time, so these must not run in UTC.
process.env.TZ = "Europe/Brussels";

import { expect, test } from "bun:test";
import { absoluteTimes, placeShots, shotsForSlot, type Shot } from "./screenshots";
import { parseLog, type ParsedShow } from "./log";
import type { RoundType } from "./types";

const DATE = "2026-09-01";

/** Log stamps are UTC; a capture's mtime is an absolute instant. Both are epochs here. */
function at(clock: string, dayOffset = 0): number {
  return Date.parse(`${DATE}T${clock}Z`) + dayOffset * 86_400_000;
}

function round(
  id: string,
  startedAt: string | undefined,
  isFinal = false,
  endedAt?: string,
) {
  return {
    id,
    name: id,
    type: (isFinal ? "final" : "unknown") as RoundType,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
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
    rounds: [
      round("hexsnake", "20:25:05", false, "20:25:30"),
      round("floor_fall", "20:25:39", true),
    ],
    winnerId: 3,
    wonAt: "20:27:15",
  },
  {
    showId: "roll_call",
    startedAt: "20:30:00",
    rounds: [round("dizzy_heights", "20:30:05")],
  },
];

function shot(file: string, takenAt: number): Shot {
  return { file, takenAt, source: "sharex" };
}

function place(clock: string, dayOffset = 0, shows = SHOWS) {
  return placeShots([shot("a.png", at(clock, dayOffset))], shows, DATE)[0]!;
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

test("a won last show closes soon after, so a later capture belongs to no show", () => {
  const shows = [SHOWS[0]!];
  expect(place("20:28:00", 0, shows)).toMatchObject({ showIndex: 0, slot: "winners" });
  expect(place("21:00:00", 0, shows).showIndex).toBeUndefined();
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
    shot("late.png", at("20:26:00")),
    shot("early.png", at("20:25:20")),
  ];
  expect(placeShots(shots, SHOWS, DATE).map((shot) => shot.file)).toEqual([
    "early.png",
    "late.png",
  ]);
});

const PLACED = placeShots(
  [
    shot("race.png", at("20:25:20")),
    shot("final.png", at("20:26:00")),
    shot("win.png", at("20:27:30")),
    shot("idle.png", at("20:25:03")),
    shot("desktop.png", at("19:00:00")),
  ],
  SHOWS,
  DATE,
);

test("a round slot picks only that round's captures", () => {
  expect(shotsForSlot(PLACED, 0, { slot: "round", roundIndex: 0 }).map((s) => s.file)).toEqual([
    "race.png",
  ]);
});

test("the final carries the victory screen with it, the winners slot stands alone", () => {
  expect(shotsForSlot(PLACED, 0, { slot: "finalists" }).map((s) => s.file)).toEqual([
    "final.png",
    "win.png",
  ]);
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

test("log stamps are read as UTC, not as the clock on the wall", () => {
  const [times] = absoluteTimes(SHOWS, DATE);
  expect(times!.startedAt).toBe(Date.parse("2026-09-01T20:25:02Z"));
  expect(times!.rounds).toEqual([
    Date.parse("2026-09-01T20:25:05Z"),
    Date.parse("2026-09-01T20:25:39Z"),
  ]);
  expect(times!.wonAt).toBe(Date.parse("2026-09-01T20:27:15Z"));
});

test("the screen after the round before the final names the finalists", () => {
  const shots: Shot[] = [
    shot("playing.png", at("20:25:20")),
    shot("qualified.png", at("20:25:35")),
  ];
  const placed = placeShots(shots, SHOWS, DATE);

  expect(placed[0]).toMatchObject({ slot: "round", roundIndex: 0 });
  expect(placed[0]!.namesFinalists).toBeUndefined();
  expect(placed[1]).toMatchObject({ slot: "round", roundIndex: 0, namesFinalists: true });

  expect(shotsForSlot(placed, 0, { slot: "finalists" }).map((s) => s.file)).toEqual([
    "qualified.png",
  ]);
  expect(shotsForSlot(placed, 0, { slot: "round", roundIndex: 0 }).map((s) => s.file)).toEqual([
    "playing.png",
    "qualified.png",
  ]);
});

test("absolute times carry each round's first qualifier", () => {
  const shows = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:20.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:00:25.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
`);
  const [times] = absoluteTimes(shows, DATE);
  expect(times!.firsts).toEqual([at("20:00:20")]);
  expect(times!.ends).toEqual([at("20:00:25")]);
});
