import { expect, test } from "bun:test";
import { Reporter } from "./report";
import type { ParsedShow } from "../log";
import type { PlacedShot } from "../screenshots";
import type { SlotFill } from "../ocr/autofill";

const DATE = "2026-09-02";

function show(over: Partial<ParsedShow> = {}): ParsedShow {
  return {
    showId: "classic_solo_main_show",
    startedAt: "23:24:48",
    rounds: [
      {
        name: "Tundra Run",
        type: "race",
        startedAt: "23:24:51",
        firstQualifiedAt: "23:25:57",
        endedAt: "23:27:04",
        qualified: [17, 4],
        eliminated: [],
        present: [17, 4, 9],
      },
    ],
    ...over,
  } as ParsedShow;
}

function texts(lines: { kind: string }[]): string[] {
  return lines.map((line) => JSON.stringify(line));
}

test("a show and its round are announced once", () => {
  const reporter = new Reporter();
  const first = reporter.observe({ shows: [show()], date: DATE, shots: [], reads: {}, fills: [] });
  expect(first.filter((line) => line.kind === "show")).toHaveLength(1);
  expect(first.filter((line) => line.kind === "round")).toHaveLength(1);

  const again = reporter.observe({ shows: [show()], date: DATE, shots: [], reads: {}, fills: [] });
  expect(again).toEqual([]);
});

test("the lobby size rides on the show rule", () => {
  const [rule] = new Reporter().observe({
    shows: [show()],
    date: DATE,
    shots: [],
    reads: {},
    fills: [],
  });
  expect(JSON.stringify(rule)).toContain("3 in the lobby");
});

test("a race reports someone across the line, anything else reports them through", () => {
  const race = new Reporter().observe({ shows: [show()], date: DATE, shots: [], reads: {}, fills: [] });
  expect(texts(race).join()).toContain("first across the line · bean 17");

  const hunt = show({ rounds: [{ ...show().rounds[0]!, type: "hunt" }] });
  const other = new Reporter().observe({ shows: [hunt], date: DATE, shots: [], reads: {}, fills: [] });
  expect(texts(other).join()).toContain("first through · bean 17");
});

test("a round over says what it cost", () => {
  const lines = new Reporter().observe({ shows: [show()], date: DATE, shots: [], reads: {}, fills: [] });
  expect(texts(lines).join()).toContain("round over · 2 qualified, 0 out");
});

test("a won show is starred and then closed", () => {
  const won = show({ wonAt: "23:33:04", winnerId: 17 });
  const lines = new Reporter().observe({ shows: [won], date: DATE, shots: [], reads: {}, fills: [] });
  expect(texts(lines).join()).toContain("show won · bean 17");
  expect(lines.filter((line) => line.kind === "closed")).toHaveLength(1);
});

test("a capture is reported where it landed", () => {
  const shot: PlacedShot = {
    file: "2026-09/FallGuys_client_game_WZzKsyP1YH.png",
    takenAt: new Date(2026, 8, 2, 23, 33, 12).getTime(),
    source: "sharex",
    showIndex: 0,
    slot: "winners",
  };
  const lines = new Reporter().observe({ shows: [show()], date: DATE, shots: [shot], reads: {}, fills: [] });
  expect(texts(lines).join()).toContain("show 1 · winners");
});

test("a read says which screen it was and what came out of it", () => {
  const shot: PlacedShot = {
    file: "a.png",
    takenAt: Date.now(),
    source: "sharex",
    showIndex: 0,
    slot: "winners",
  };
  const lines = new Reporter().observe({
    shows: [show()],
    date: DATE,
    shots: [shot],
    reads: { "a.png": { screen: "winner", tokens: ["BeckitoBurrito"] } },
    fills: [],
  });
  expect(texts(lines).join()).toContain("BeckitoBurrito");
});

test("a capture worth nothing says so rather than going quiet", () => {
  const shot: PlacedShot = { file: "a.png", takenAt: Date.now(), source: "auto", showIndex: 0 };
  const lines = new Reporter().observe({
    shows: [show()],
    date: DATE,
    shots: [shot],
    reads: { "a.png": { tokens: [] } },
    fills: [],
  });
  expect(texts(lines).join()).toContain("nothing worth reading");
});

test("a fill names the field it is offered to, and flags a name nobody claimed", () => {
  const fills: SlotFill[] = [
    { showIndex: 0, slot: "first", roundIndex: 0, names: ["Wouter"], matched: [false], from: "a.png" },
  ];
  const lines = new Reporter().observe({ shows: [show()], date: DATE, shots: [], reads: {}, fills });
  const fill = lines.find((line) => line.kind === "entry" && line.lane === "fill")!;
  expect(JSON.stringify(fill)).toContain("round 1 · first ← Wouter");
  expect(JSON.stringify(fill)).toContain("warn");
});

test("a re-read of the same capture is reported again, because it may say something new", () => {
  const shot: PlacedShot = { file: "a.png", takenAt: 1, source: "auto", showIndex: 0 };
  const state = {
    shows: [show()],
    date: DATE,
    shots: [shot],
    reads: { "a.png": { screen: "winner" as const, tokens: ["One"] } },
    fills: [],
  };
  const reporter = new Reporter();
  reporter.observe(state);
  const again = reporter.observe({ ...state, reads: { "a.png": { screen: "winner", tokens: ["Two"] } } });
  expect(texts(again).join()).toContain("Two");
});

test("lines come out in the order they happened", () => {
  const lines = new Reporter().observe({
    shows: [show({ wonAt: "23:33:04", winnerId: 17 })],
    date: DATE,
    shots: [],
    reads: {},
    fills: [],
  });
  const stamps = lines.flatMap((line) => ("at" in line ? [line.at] : []));
  expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
});
