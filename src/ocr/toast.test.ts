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

/** A nametag following a bean around a level trips a pill wherever the bean happens to stand. */
test("a pill on its own halfway down the column is a nametag, not a toast", async () => {
  expect(trophyPill(await frameFrom("src/ocr/samples/playing-nametags.jpg"))).toBeUndefined();
});

test("pills are stacked at a fixed pitch", async () => {
  const frame = await frameFrom("src/ocr/samples/toast.jpg");
  expect(pillBox(frame, 1).y - pillBox(frame, 0).y).toBe(30);
});

/**
 * A pill on its way out goes translucent before it goes: the level's own colour reaches the body,
 * where an opaque pill keeps it out. The yellow coming through is what the trophy test reads as gold.
 */
test("a pill faded far enough to show the level through it is not a toast", async () => {
  expect(trophyPill(await frameFrom("fixtures/playing/auto-7-first-012223-5.jpg"))).toBeUndefined();
});
