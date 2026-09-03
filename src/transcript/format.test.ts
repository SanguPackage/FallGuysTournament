import { expect, test } from "bun:test";
import { duration, formatLine, WIDTH, type Line } from "./format";

const AT = new Date(2026, 8, 2, 23, 25, 57).getTime();
const ESC = "\u001B";

function entry(over: Partial<Extract<Line, { kind: "entry" }>> = {}): Line {
  return { kind: "entry", at: AT, lane: "log", text: "first across the line", ...over };
}

test("an entry puts the clock and the lane in fixed columns", () => {
  expect(formatLine(entry())).toBe("23:25:57  log     first across the line");
});

test("the widest lane still leaves the text where the narrowest does", () => {
  const wide = formatLine(entry({ lane: "shots", text: "x" }));
  const narrow = formatLine(entry({ lane: "ocr", text: "x" }));
  expect(wide.indexOf("x")).toBe(narrow.indexOf("x"));
});

test("a mark is right-aligned to the transcript width", () => {
  const line = formatLine(entry({ lane: "ocr", text: "toast", mark: { kind: "ok", text: "roster" } }));
  expect(line).toHaveLength(WIDTH);
  expect(line.endsWith("✓ roster")).toBe(true);
});

test("a mark on a line too long to align follows the text instead", () => {
  const line = formatLine(entry({ text: "x".repeat(WIDTH), mark: { kind: "warn", text: "late" } }));
  expect(line.endsWith("x  ⚠ late")).toBe(true);
});

test("a won show is starred where the eye is already looking", () => {
  expect(formatLine(entry({ text: "show won", star: true }))).toContain("★ show won");
});

test("a show rule names the show and closes on its clock", () => {
  const line = formatLine({
    kind: "show",
    at: AT,
    number: 4,
    name: "classic_solo_main_show",
    note: "24 in the lobby",
  });
  expect(line).toHaveLength(WIDTH);
  expect(line).toContain("SHOW 4");
  expect(line).toContain("classic_solo_main_show");
  expect(line).toContain("24 in the lobby");
  expect(line.endsWith("23:25:57 ━━━━")).toBe(true);
});

test("a round rule names the map and its type", () => {
  const line = formatLine({ kind: "round", at: AT, number: 1, map: "Tundra Run", type: "race" });
  expect(line).toHaveLength(WIDTH);
  expect(line).toContain("ROUND 1");
  expect(line).toContain("Tundra Run · race");
});

test("a closing rule says how the show ended", () => {
  const line = formatLine({ kind: "closed", at: AT, number: 4, note: "won by BeckitoBurrito" });
  expect(line).toHaveLength(WIDTH);
  expect(line).toContain("SHOW 4 CLOSED");
  expect(line).toContain("won by BeckitoBurrito");
});

test("a note is a bare rule, so a restart is visible without being an event", () => {
  const line = formatLine({ kind: "note", text: "server restarted" });
  expect(line).toHaveLength(WIDTH);
  expect(line).toContain("server restarted");
});

test("a duration reads as seconds until it is worth minutes", () => {
  expect(duration(7_400)).toBe("7s");
  expect(duration(77_000)).toBe("1m17s");
  expect(duration(3_600_000)).toBe("60m00s");
});

test("nothing carries colour unless it is asked for", () => {
  const line = formatLine(entry({ mark: { kind: "fail", text: "unreadable" } }));
  expect(line).not.toContain(ESC);
});

test("colour lands on the mark and leaves the body alone", () => {
  const line = formatLine(entry({ text: "plain body", mark: { kind: "ok", text: "roster" } }), true);
  expect(line.slice(0, line.indexOf(ESC))).toContain("plain body");
});

test("a coloured line is no wider than a plain one once the codes come off", () => {
  const line = { kind: "entry", at: AT, lane: "ocr", text: "toast", mark: { kind: "ok", text: "roster" } } as const;
  const stripped = formatLine(line, true).replaceAll(/\u001B\[[0-9;]*m/g, "");
  expect(stripped).toBe(formatLine(line));
});
