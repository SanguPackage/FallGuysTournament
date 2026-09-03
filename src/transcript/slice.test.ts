import { expect, test } from "bun:test";
import { linesBetween } from "./slice";
import type { Entry } from "./transcript";

const at = (clock: string) => Date.parse(`2026-09-02T${clock}Z`);
const line = (clock: string, text: string): Entry => ({
  kind: "entry",
  at: at(clock),
  lane: "ocr",
  text,
});

const EVENING: Entry[] = [
  { kind: "note", text: "server started" },
  line("20:59:00", "before"),
  line("21:00:00", "on the boundary"),
  line("21:02:00", "inside"),
  line("21:05:00", "the next show's"),
];

test("a show's lines run from its start, inclusive, to the next show's, exclusive", () => {
  expect(linesBetween(EVENING, at("21:00:00"), at("21:05:00")).map((e) => e.at)).toEqual([
    at("21:00:00"),
    at("21:02:00"),
  ]);
});

test("the show still being played takes everything from its start on", () => {
  expect(linesBetween(EVENING, at("21:00:00"), Infinity)).toHaveLength(3);
});

test("a line with no clock belongs to the server, not to a show", () => {
  const lines: Entry[] = linesBetween(EVENING, 0, Infinity);
  expect(lines.some((e) => e.kind === "note")).toBe(false);
});
