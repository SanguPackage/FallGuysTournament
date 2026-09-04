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
