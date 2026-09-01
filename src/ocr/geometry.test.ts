import { expect, test } from "bun:test";
import { toPixels } from "./geometry";

test("a fractional region becomes a pixel box in the frame's own size", () => {
  expect(toPixels({ x: 0.5, y: 0.25, w: 0.1, h: 0.2 }, { width: 1920, height: 1080 })).toEqual({
    x: 960,
    y: 270,
    w: 192,
    h: 216,
  });
});

test("a region is rounded, never fractional", () => {
  const box = toPixels({ x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 }, { width: 100, height: 100 });
  expect(Object.values(box).every(Number.isInteger)).toBe(true);
});
