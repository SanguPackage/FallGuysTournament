import { expect, test } from "bun:test";
import { frameFrom } from "../ocr/frame";
import { pick } from "./pick";
import type { Screen } from "../ocr/recognizers";

const SAMPLES = "src/ocr/samples";
const candidate = (name: string, at: number) => ({ path: `${SAMPLES}/${name}`, at });
const want = (...pairs: [Screen, number][]) => new Map(pairs);

test("only frames showing the wanted screen are kept", async () => {
  const { kept } = await pick(
    [candidate("lobby.jpg", 1), candidate("toast.jpg", 2), candidate("grid-15.jpg", 3)],
    want(["toast", 5]),
    frameFrom,
  );
  expect(kept.get("toast")!.map((frame) => frame.path)).toEqual([`${SAMPLES}/toast.jpg`]);
});

test("the earliest frames win when more pass than the limit", async () => {
  const { kept } = await pick(
    [candidate("grid-15.jpg", 30), candidate("grid-5.jpg", 10)],
    want(["grid", 1]),
    frameFrom,
  );
  expect(kept.get("grid")!.map((frame) => frame.at)).toEqual([10]);
});

test("nothing passing yields nothing rather than a guess", async () => {
  const { kept } = await pick([candidate("lobby.jpg", 1)], want(["winner", 5]), frameFrom);
  expect(kept.get("winner")).toEqual([]);
});

test("a frame that cannot be decoded is skipped, not fatal", async () => {
  const { kept } = await pick(
    [candidate("missing.jpg", 1), candidate("winner.jpg", 2)],
    want(["winner", 5]),
    frameFrom,
  );
  expect(kept.get("winner")!.map((frame) => frame.at)).toEqual([2]);
});

test("how many frames were actually read is reported, so a pass that read none can be retried", async () => {
  const searched = await pick(
    [candidate("missing.jpg", 1), candidate("lobby.jpg", 2)],
    want(["winner", 5]),
    frameFrom,
  );
  expect(searched.kept.get("winner")).toEqual([]);
  expect(searched.classified).toBe(1);
});

test("two screens are filled from one read of the footage", async () => {
  const { kept, classified } = await pick(
    [candidate("grid-5.jpg", 1), candidate("winner.jpg", 2), candidate("grid-15.jpg", 3)],
    want(["grid", 5], ["winner", 5]),
    frameFrom,
  );
  expect(kept.get("grid")!.map((frame) => frame.at)).toEqual([1, 3]);
  expect(kept.get("winner")!.map((frame) => frame.at)).toEqual([2]);
  expect(classified).toBe(3);
});

test("reading stops once every screen has its fill, not once one has", async () => {
  const { classified } = await pick(
    [candidate("grid-5.jpg", 1), candidate("lobby.jpg", 2), candidate("winner.jpg", 3)],
    want(["grid", 1], ["winner", 1]),
    frameFrom,
  );
  expect(classified).toBe(3);
});

test("a screen already full takes no more, so a pass can carry on where the last stopped", async () => {
  const { kept, classified } = await pick(
    [candidate("grid-5.jpg", 1), candidate("winner.jpg", 2)],
    want(["grid", 0], ["winner", 1]),
    frameFrom,
  );
  expect(kept.get("grid")).toEqual([]);
  expect(kept.get("winner")!.map((frame) => frame.at)).toEqual([2]);
  expect(classified).toBe(2);
});
