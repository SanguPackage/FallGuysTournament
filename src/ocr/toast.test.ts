import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { pillBox, trophyPill } from "./toast";

test("the trophy is found on the second pill, not the first", async () => {
  expect(trophyPill(await frameFrom("src/ocr/samples/toast.jpg"))).toBe(1);
});

test("a frame with no toast column has no trophy", async () => {
  for (const file of ["grid-5.jpg", "winner.jpg", "lobby.jpg"]) {
    expect(trophyPill(await frameFrom(`src/ocr/samples/${file}`))).toBeUndefined();
  }
});

test("pills are stacked at a fixed pitch", async () => {
  const frame = await frameFrom("src/ocr/samples/toast.jpg");
  expect(pillBox(frame, 1).y - pillBox(frame, 0).y).toBe(30);
});
