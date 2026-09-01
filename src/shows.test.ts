import { expect, test } from "bun:test";
import { playableAt } from "./shows";
import type { ShowInOrder } from "../site/rules";

const order: ShowInOrder[] = [
  { position: 1, show: "Solos", tier: "Opening", min: 2, max: 32 },
  { position: 2, show: "Finals Marathon", tier: "Middle", min: 2, max: 16 },
  { position: 3, show: "Slime Survivors", tier: "Middle", min: 5, max: 24 },
];

test("a headcount inside every limit plays the whole list", () => {
  const result = playableAt(order, 16);
  expect(result.play.map((s) => s.show)).toEqual(["Solos", "Finals Marathon", "Slime Survivors"]);
  expect(result.skip).toEqual([]);
});

test("a show is skipped above its maximum", () => {
  const result = playableAt(order, 21);
  expect(result.play.map((s) => s.show)).toEqual(["Solos", "Slime Survivors"]);
  expect(result.skip).toEqual([
    { show: "Finals Marathon", reason: "needs at most 16 players" },
  ]);
});

test("a show is skipped below its minimum", () => {
  const result = playableAt(order, 3);
  expect(result.play.map((s) => s.show)).toEqual(["Solos", "Finals Marathon"]);
  expect(result.skip).toEqual([
    { show: "Slime Survivors", reason: "needs at least 5 players" },
  ]);
});

test("the playable list keeps the order given", () => {
  expect(playableAt(order, 21).play.map((s) => s.position)).toEqual([1, 3]);
});
