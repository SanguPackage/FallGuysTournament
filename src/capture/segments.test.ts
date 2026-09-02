import { expect, test } from "bun:test";
import { coverage, offsetIn, parseSegments } from "./segments";

const START = Date.parse("2026-09-05T20:00:00Z");
const CSV = `seg-00000.mkv,0.000000,30.033000
seg-00001.mkv,30.033000,60.033000
seg-00002.mkv,60.033000,90.100000
`;

test("a csv row becomes a segment on the wall clock", () => {
  const [first, , third] = parseSegments(CSV, START);
  expect(first).toEqual({ file: "seg-00000.mkv", from: START, to: START + 30_033 });
  expect(third!.from).toBe(START + 60_033);
});

test("a blank or partial csv yields no segments rather than throwing", () => {
  expect(parseSegments("", START)).toEqual([]);
  expect(parseSegments("seg-00000.mkv,0.000000\n", START)).toEqual([]);
});

test("a window inside one segment is covered by it alone", () => {
  const { parts, complete } = coverage(parseSegments(CSV, START), START + 5_000, START + 7_000);
  expect(parts.map((part) => part.file)).toEqual(["seg-00000.mkv"]);
  expect(complete).toBe(true);
});

test("a window straddling a boundary is covered by both segments, in order", () => {
  const { parts, complete } = coverage(parseSegments(CSV, START), START + 29_000, START + 31_000);
  expect(parts.map((part) => part.file)).toEqual(["seg-00000.mkv", "seg-00001.mkv"]);
  expect(complete).toBe(true);
});

test("a window running past the last closed segment is not complete", () => {
  const { complete } = coverage(parseSegments(CSV, START), START + 89_000, START + 95_000);
  expect(complete).toBe(false);
});

test("a window before the recording began is not complete", () => {
  const { complete } = coverage(parseSegments(CSV, START), START - 5_000, START + 1_000);
  expect(complete).toBe(false);
});

test("an offset is seconds into the segment, never negative", () => {
  const [first] = parseSegments(CSV, START);
  expect(offsetIn(first!, START + 4_500)).toBeCloseTo(4.5);
  expect(offsetIn(first!, START - 1_000)).toBe(0);
});
