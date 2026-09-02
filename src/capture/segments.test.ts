import { expect, test } from "bun:test";
import { coverage, offsetIn, parseSegments } from "./segments";

const START = Date.parse("2026-09-05T20:00:00Z");
const DIR = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T22h00m00";
const CSV = `seg-00000.mkv,0.000000,30.033000
seg-00001.mkv,30.033000,60.033000
seg-00002.mkv,60.033000,90.100000
`;

// A second run: ffmpeg died 90s in and was respawned 12s later, numbering from zero again.
const NEXT_DIR = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T22h01m42";
const NEXT_START = START + 102_000;
const NEXT_CSV = `seg-00000.mkv,0.000000,30.000000
`;

test("a csv row becomes a segment on the wall clock, in the run folder that wrote it", () => {
  const [first, , third] = parseSegments(CSV, START, DIR);
  expect(first).toEqual({ file: "seg-00000.mkv", dir: DIR, from: START, to: START + 30_033 });
  expect(third!.from).toBe(START + 60_033);
});

test("a blank or partial csv yields no segments rather than throwing", () => {
  expect(parseSegments("", START, DIR)).toEqual([]);
  expect(parseSegments("seg-00000.mkv,0.000000\n", START, DIR)).toEqual([]);
});

test("a window inside one segment is covered by it alone", () => {
  const { parts, complete, gapped } = coverage(
    parseSegments(CSV, START, DIR),
    START + 5_000,
    START + 7_000,
  );
  expect(parts.map((part) => part.file)).toEqual(["seg-00000.mkv"]);
  expect(complete).toBe(true);
  expect(gapped).toBe(false);
});

test("a window straddling a boundary is covered by both segments, in order", () => {
  const { parts, complete, gapped } = coverage(
    parseSegments(CSV, START, DIR),
    START + 29_000,
    START + 31_000,
  );
  expect(parts.map((part) => part.file)).toEqual(["seg-00000.mkv", "seg-00001.mkv"]);
  expect(complete).toBe(true);
  expect(gapped).toBe(false);
});

test("a window running past the last closed segment is not complete", () => {
  const { complete } = coverage(parseSegments(CSV, START, DIR), START + 89_000, START + 95_000);
  expect(complete).toBe(false);
});

test("a window before the recording began is not complete", () => {
  const { complete } = coverage(parseSegments(CSV, START, DIR), START - 5_000, START + 1_000);
  expect(complete).toBe(false);
});

test("a window spanning two runs is covered by both, and reported as gapped", () => {
  const segments = [
    ...parseSegments(CSV, START, DIR),
    ...parseSegments(NEXT_CSV, NEXT_START, NEXT_DIR),
  ];
  const { parts, complete, gapped } = coverage(segments, START + 80_000, START + 110_000);
  expect(parts.map((part) => `${part.dir}/${part.file}`)).toEqual([
    `${DIR}/seg-00002.mkv`,
    `${NEXT_DIR}/seg-00000.mkv`,
  ]);
  expect(complete).toBe(true);
  expect(gapped).toBe(true);
});

test("an offset is seconds into the segment, never negative", () => {
  const [first] = parseSegments(CSV, START, DIR);
  expect(offsetIn(first!, START + 4_500)).toBeCloseTo(4.5);
  expect(offsetIn(first!, START - 1_000)).toBe(0);
});
