import { expect, test } from "bun:test";
import { crownTitle } from "./crown";

test("a crown level names the crowns it spans", () => {
  expect(crownTitle(45)).toBe("Crown level 45 · 474–503 crowns");
});

test("a level worth a single crown is not written as a range", () => {
  expect(crownTitle(2)).toBe("Crown level 2 · 1 crown");
});

test("everyone starts on level 1, which costs nothing", () => {
  expect(crownTitle(1)).toBe("Crown level 1 · 0 crowns");
});

test("the top level has no ceiling above it", () => {
  expect(crownTitle(85)).toBe("Crown level 85 · 10000+ crowns");
});

test("a level the table does not carry has no title at all", () => {
  expect(crownTitle(0)).toBeUndefined();
  expect(crownTitle(86)).toBeUndefined();
  expect(crownTitle(4.5)).toBeUndefined();
});
