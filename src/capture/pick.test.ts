import { expect, test } from "bun:test";
import { frameFrom } from "../ocr/frame";
import { pick } from "./pick";

const SAMPLES = "src/ocr/samples";
const candidate = (name: string, at: number) => ({ path: `${SAMPLES}/${name}`, at });

test("only frames showing the wanted screen are kept", async () => {
  const { kept } = await pick(
    [candidate("lobby.jpg", 1), candidate("toast.jpg", 2), candidate("grid-15.jpg", 3)],
    "toast",
    5,
    frameFrom,
  );
  expect(kept.map((frame) => frame.path)).toEqual([`${SAMPLES}/toast.jpg`]);
});

test("the earliest frames win when more pass than the limit", async () => {
  const { kept } = await pick(
    [candidate("grid-15.jpg", 30), candidate("grid-5.jpg", 10)],
    "grid",
    1,
    frameFrom,
  );
  expect(kept.map((frame) => frame.at)).toEqual([10]);
});

test("nothing passing yields nothing rather than a guess", async () => {
  expect((await pick([candidate("lobby.jpg", 1)], "winner", 5, frameFrom)).kept).toEqual([]);
});

test("a frame that cannot be decoded is skipped, not fatal", async () => {
  const { kept } = await pick(
    [candidate("missing.jpg", 1), candidate("winner.jpg", 2)],
    "winner",
    5,
    frameFrom,
  );
  expect(kept.map((frame) => frame.at)).toEqual([2]);
});

test("how many frames were actually read is reported, so a pass that read none can be retried", async () => {
  const searched = await pick(
    [candidate("missing.jpg", 1), candidate("lobby.jpg", 2)],
    "winner",
    5,
    frameFrom,
  );
  expect(searched).toEqual({ kept: [], classified: 1 });
});
