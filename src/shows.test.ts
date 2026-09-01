import { expect, test } from "bun:test";
import { limitsFor, playable, playableAt } from "./shows";
import type { ShowLimits } from "./types";

const limits: ShowLimits = {
  source: "https://example.invalid",
  fetched: "2026-09-01",
  shows: {
    Solos: { min: 2, max: 32 },
    "Finals Marathon": { min: 2, max: 16 },
    "Slime Survivors": { min: 5, max: 24 },
  },
};

test("a show is playable inside its limits", () => {
  expect(playable(limits, "Solos", 21)).toBe(true);
});

test("a show is not playable above its maximum", () => {
  expect(playable(limits, "Finals Marathon", 21)).toBe(false);
  expect(playable(limits, "Finals Marathon", 16)).toBe(true);
});

test("a show is not playable below its minimum", () => {
  expect(playable(limits, "Slime Survivors", 4)).toBe(false);
  expect(playable(limits, "Slime Survivors", 5)).toBe(true);
});

test("a show the wiki does not list is treated as playable", () => {
  expect(playable(limits, "Some Creative Level", 21)).toBe(true);
});

test("limitsFor returns undefined for an unknown show", () => {
  expect(limitsFor(limits, "Some Creative Level")).toBeUndefined();
  expect(limitsFor(limits, "Solos")).toEqual({ min: 2, max: 32 });
});

test("show names match regardless of case", () => {
  expect(limitsFor(limits, "finals marathon")).toEqual({ min: 2, max: 16 });
});

test("playableAt splits an ordered list into playable and skipped", () => {
  const result = playableAt(limits, ["Solos", "Finals Marathon", "Slime Survivors"], 21);
  expect(result.play).toEqual(["Solos", "Slime Survivors"]);
  expect(result.skip).toEqual([{ show: "Finals Marathon", reason: "needs at most 16 players" }]);
});

test("playableAt explains a show that needs more players", () => {
  const result = playableAt(limits, ["Slime Survivors"], 3);
  expect(result.play).toEqual([]);
  expect(result.skip).toEqual([{ show: "Slime Survivors", reason: "needs at least 5 players" }]);
});
