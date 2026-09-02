import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { cardBox, hasQualifiedBanner, nameBand, qualifiedCards } from "./grid";

test("the board counts exactly the cards the game says qualified", async () => {
  expect(qualifiedCards(await frameFrom("src/ocr/samples/grid-15.jpg")).length).toBe(15);
  expect(qualifiedCards(await frameFrom("src/ocr/samples/grid-5.jpg")).length).toBe(5);
});

test("a frame that is not a board has no cards at all", async () => {
  for (const file of ["lobby.jpg", "winner.jpg", "toast.jpg"]) {
    expect(qualifiedCards(await frameFrom(`src/ocr/samples/${file}`)).length).toBe(0);
  }
});

test("the five qualified cards are the ones the eye can see", async () => {
  const cards = qualifiedCards(await frameFrom("src/ocr/samples/grid-5.jpg"));
  expect(cards.map((c) => `${c.row},${c.col}`).sort()).toEqual(["0,4", "0,5", "1,2", "2,2", "2,5"]);
});

test("the banner says whether a board is on screen at all", async () => {
  for (const file of ["grid-15.jpg", "grid-9.jpg", "grid-5.jpg"]) {
    expect(hasQualifiedBanner(await frameFrom(`src/ocr/samples/${file}`))).toBe(true);
  }
  // The cells are green-tested rectangles, so a level of pink slime and green beans fills them.
  for (const file of ["playing-scenery.jpg", "winner.jpg", "lobby.jpg", "toast.jpg"]) {
    expect(hasQualifiedBanner(await frameFrom(`src/ocr/samples/${file}`))).toBe(false);
  }
});

test("the board reads as many cards as the banner counts", async () => {
  expect(qualifiedCards(await frameFrom("src/ocr/samples/grid-9.jpg")).length).toBe(9);
});

test("a name band ends at its card's right edge and sits just above it", async () => {
  const frame = await frameFrom("src/ocr/samples/grid-5.jpg");
  const box = nameBand(frame, { row: 0, col: 4 });
  const card = cardBox(frame, { row: 0, col: 4 });
  expect(box.x + box.w).toBeGreaterThanOrEqual(card.x + card.w);
  expect(box.y + box.h).toBeLessThanOrEqual(card.y + 4);
  expect(box.h).toBe(18);
});
