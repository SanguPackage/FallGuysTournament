import { expect, test } from "bun:test";
import { anyoneRegistered, fillableShots, seededRoster } from "./seed";
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
    { ingame: "Diego_9942", seeded: true },
    { ingame: "Serxav_9", seeded: true },
  ]);
});

test("the admin keeps their row and their fields", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([ADMIN], shots, reads)).toEqual([ADMIN, { ingame: "Diego_9942", seeded: true }]);
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
    { ingame: "Diego_9942", seeded: true },
  ]);
});

test("a board off a later round is not the first board", () => {
  const shots = [shot("g.jpg", { roundIndex: 2 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Diego_9942"] } };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("the show being played is the one the roster comes from", () => {
  const shots = [
    shot("one.jpg", { showIndex: 0 }),
    shot("two.jpg", { showIndex: 1 }),
  ];
  const reads: Record<string, ShotRead> = {
    "one.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "two.jpg": { screen: "grid", tokens: ["Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([{ ingame: "Serxav_9", seeded: true }]);
});

test("a roster read off an earlier show is replaced, not added to", () => {
  const shots = [
    shot("one.jpg", { showIndex: 0 }),
    shot("two.jpg", { showIndex: 1 }),
  ];
  const reads: Record<string, ShotRead> = {
    "one.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "two.jpg": { screen: "grid", tokens: ["Serxav_9"] },
  };
  const already = [ADMIN, { ingame: "Diego_9942", seeded: true }];
  expect(seededRoster(already, shots, reads)).toEqual([ADMIN, { ingame: "Serxav_9", seeded: true }]);
});

test("a roster read off a board is not a signup, so the next show replaces it", () => {
  expect(anyoneRegistered([ADMIN, { ingame: "Diego_9942", seeded: true }])).toBe(false);
});

test("a name typed in by hand is a signup, so no board ever overwrites it", () => {
  const shots = [shot("g.jpg", { showIndex: 3 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Serxav_9"] } };
  expect(seededRoster([{ ingame: "BigMooseLips" }], shots, reads)).toBeUndefined();
});

test("the same show read twice does not churn the roster", () => {
  const shots = [shot("g.jpg", { showIndex: 1 })];
  const reads: Record<string, ShotRead> = { "g.jpg": { screen: "grid", tokens: ["Serxav_9"] } };
  const already = [ADMIN, { ingame: "Serxav_9", seeded: true }];
  expect(seededRoster(already, shots, reads)).toBeUndefined();
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
    { ingame: "Diego_9942", seeded: true },
    { ingame: "Serxav_9", seeded: true },
    { ingame: "BigMooseLips", seeded: true },
  ]);
});

test("two reads of the same size go with the later capture", () => {
  const shots = [shot("early.jpg", { takenAt: 10 }), shot("late.jpg", { takenAt: 20 })];
  const reads: Record<string, ShotRead> = {
    "early.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "late.jpg": { screen: "grid", tokens: ["Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([{ ingame: "Serxav_9", seeded: true }]);
});

test("the admin read off the board keeps their own row rather than gaining a second", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["AnotherAccount58", "Diego_9942"] },
  };
  expect(seededRoster([ADMIN], shots, reads)).toEqual([ADMIN, { ingame: "Diego_9942", seeded: true }]);
});

test("a board that read one name twice seeds it once", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Diego_9942"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([{ ingame: "Diego_9942", seeded: true }]);
});

test("a board holding nobody new leaves the roster alone", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["AnotherAccount58"] },
  };
  expect(seededRoster([ADMIN], shots, reads)).toBeUndefined();
});

test("nobody is signed up when the file holds only an admin and a row being typed in", () => {
  expect(anyoneRegistered([ADMIN, { ingame: "" }])).toBe(false);
});

test("one name is enough to be signed up, even from a player who withdrew", () => {
  expect(anyoneRegistered([ADMIN, { ingame: "BigMooseLips", joined: false }])).toBe(true);
});

test("an admin playing under their own name is not a signup", () => {
  expect(anyoneRegistered([ADMIN])).toBe(false);
});

test("a board is not seeded from while a capture of its round is still unread", () => {
  const shots = [shot("early.jpg"), shot("late.jpg")];
  const reads: Record<string, ShotRead> = {
    "early.jpg": { screen: "grid", tokens: ["Diego_9942"] },
  };
  expect(seededRoster([], shots, reads)).toBeUndefined();
});

test("the board with the most names wins once the whole round is read", () => {
  const shots = [shot("early.jpg"), shot("late.jpg")];
  const reads: Record<string, ShotRead> = {
    "early.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "late.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([
    { ingame: "Diego_9942", seeded: true },
    { ingame: "Serxav_9", seeded: true },
  ]);
});

test("a show still being read leaves the show before it as the roster", () => {
  const shots = [
    shot("one.jpg", { showIndex: 0 }),
    shot("two.jpg", { showIndex: 1 }),
    shot("three.jpg", { showIndex: 1 }),
  ];
  const reads: Record<string, ShotRead> = {
    "one.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "two.jpg": { screen: "grid", tokens: ["Serxav_9"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([{ ingame: "Diego_9942", seeded: true }]);
});

test("stray glyphs are stripped from the names the roster is seeded with", () => {
  const shots = [shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["- Diego_9942 ", "Serxav_9 @"] },
  };
  expect(seededRoster([], shots, reads)).toEqual([
    { ingame: "Diego_9942", seeded: true },
    { ingame: "Serxav_9", seeded: true },
  ]);
});

test("a test run writes no fill until its first board is in", () => {
  const shots = [shot("t.jpg"), shot("g.jpg")];
  const reads: Record<string, ShotRead> = { "t.jpg": { screen: "toast", tokens: ["D1ego_994z"] } };
  expect(fillableShots([], shots, reads)).toEqual([]);
});

test("a test run fills from every capture once its board is in", () => {
  const shots = [shot("t.jpg"), shot("g.jpg")];
  const reads: Record<string, ShotRead> = {
    "t.jpg": { screen: "toast", tokens: ["D1ego_994z"] },
    "g.jpg": { screen: "grid", tokens: ["Diego_9942"] },
  };
  expect(fillableShots([], shots, reads)).toEqual(shots);
});

test("a test run holds back a show whose lobby it has not read yet", () => {
  const shots = [shot("g.jpg", { showIndex: 0 }), shot("t.jpg", { showIndex: 1 })];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942"] },
    "t.jpg": { screen: "toast", tokens: ["Serxav_9"] },
  };
  expect(fillableShots([], shots, reads)).toEqual([shots[0]!]);
});

test("a tournament fills from every capture, board or no board", () => {
  const shots = [shot("t.jpg")];
  const reads: Record<string, ShotRead> = { "t.jpg": { screen: "toast", tokens: ["B1gMooseL1ps"] } };
  expect(fillableShots([{ ingame: "BigMooseLips" }], shots, reads)).toEqual(shots);
});
