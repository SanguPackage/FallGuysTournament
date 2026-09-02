import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { hasEliminatedBanner, pillBox, trophyPill } from "./toast";

test("the trophy is found on the second pill, not the first", async () => {
  expect(trophyPill(await frameFrom("src/ocr/samples/toast.jpg"))).toBe(1);
});

test("a frame with no toast column has no trophy", async () => {
  for (const file of ["grid-5.jpg", "winner.jpg", "lobby.jpg"]) {
    expect(trophyPill(await frameFrom(`src/ocr/samples/${file}`))).toBeUndefined();
  }
});

/**
 * The eliminated banner lands on the same rows as the column and names the bean that just went out,
 * with a trophy beside it when they are wearing a crown. Reading it would award the round's first
 * place to whoever lost it.
 */
test("the eliminated banner is not mistaken for the column", async () => {
  const frame = await frameFrom("src/ocr/samples/eliminated.jpg");
  expect(hasEliminatedBanner(frame)).toBe(true);
  expect(trophyPill(frame)).toBeUndefined();
});

test("a real toast column carries no eliminated banner", async () => {
  expect(hasEliminatedBanner(await frameFrom("src/ocr/samples/toast.jpg"))).toBe(false);
});

/** A nametag following a bean around a level trips a pill wherever the bean happens to stand. */
test("a pill on its own halfway down the column is a nametag, not a toast", async () => {
  expect(trophyPill(await frameFrom("src/ocr/samples/playing-nametags.jpg"))).toBeUndefined();
});

test("pills are stacked at a fixed pitch", async () => {
  const frame = await frameFrom("src/ocr/samples/toast.jpg");
  expect(pillBox(frame, 1).y - pillBox(frame, 0).y).toBe(30);
});
