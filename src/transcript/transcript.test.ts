import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transcript, openTranscriptFile, transcriptPath } from "./transcript";
import type { Line } from "./format";

const ESC = "\u001B[";

const AT = new Date(2026, 8, 2, 23, 25, 57).getTime();

function collect(level: "quiet" | "normal" | "trace") {
  const seen: string[] = [];
  const kept: string[] = [];
  const transcript = new Transcript({
    level,
    colour: false,
    out: (text) => seen.push(text),
    file: (text) => kept.push(text),
  });
  return { transcript, seen, kept };
}

const OCR: Line = { kind: "entry", at: AT, lane: "ocr", text: "toast" };
const FILL: Line = { kind: "entry", at: AT, lane: "fill", text: "round 1 · first" };
const SPOT: Line = { kind: "entry", at: AT, lane: "queue", text: "1/11 a.jpg" };

test("quiet keeps what happened and drops how it was worked out", () => {
  const { transcript, seen } = collect("quiet");
  transcript.write(FILL);
  transcript.write(OCR);
  expect(seen.join()).toContain("round 1 · first");
  expect(seen.join()).not.toContain("toast");
});

test("the default shows the reader working but not every capture it picks up", () => {
  const { transcript, seen } = collect("normal");
  transcript.write(OCR);
  transcript.write(SPOT);
  expect(seen.join()).toContain("toast");
  expect(seen.join()).not.toContain("1/11");
});

test("a line may name its own level, so a queue summary outlives its lane", () => {
  const { transcript, seen } = collect("normal");
  transcript.write({ ...SPOT, text: "11 waiting", level: "normal" });
  expect(seen.join()).toContain("11 waiting");
});

test("trace keeps everything", () => {
  const { transcript, seen } = collect("trace");
  transcript.write(SPOT);
  expect(seen.join()).toContain("1/11");
});

test("a rule is never filtered: it is what makes the rest findable", () => {
  const { transcript, seen } = collect("quiet");
  transcript.write({ kind: "round", at: AT, number: 1, map: "Tundra Run", type: "race" });
  expect(seen.join()).toContain("ROUND 1");
});

test("the file keeps what the terminal was told to hide", () => {
  const { transcript, seen, kept } = collect("quiet");
  transcript.write(SPOT);
  expect(seen).toHaveLength(0);
  expect(kept.join()).toContain("1/11");
});

test("colour is for the terminal; the file stays greppable", () => {
  const seen: string[] = [];
  const kept: string[] = [];
  const transcript = new Transcript({
    level: "normal",
    colour: true,
    out: (text) => seen.push(text),
    file: (text) => kept.push(text),
  });
  transcript.write({ ...OCR, mark: { kind: "ok", text: "roster" } });
  expect(seen.join()).toContain(ESC);
  expect(kept.join()).not.toContain(ESC);
});

test("the evening's transcript sits at the root of the capture tree", () => {
  expect(transcriptPath("/capture", "2026-09-02")).toBe("/capture/2026-09-02.transcript.txt");
});

test("a tap sees every line, whatever the terminal was told to show", () => {
  const tapped: Line[] = [];
  const transcript = new Transcript({
    level: "quiet",
    colour: false,
    out: () => {},
    tap: (line) => tapped.push(line),
  });
  transcript.write(SPOT);
  expect(tapped).toEqual([SPOT]);
});

test("a file transcript appends, so a restart does not cost the evening", async () => {
  const dir = await mkdtemp(join(tmpdir(), "transcript-"));
  const path = join(dir, "2026-09", "2026-09-02.transcript.txt");

  const first = await openTranscriptFile(path);
  first("before the restart");
  await first.close();

  const second = await openTranscriptFile(path);
  second("after the restart");
  await second.close();

  expect(await readFile(path, "utf8")).toBe("before the restart\nafter the restart\n");
});
