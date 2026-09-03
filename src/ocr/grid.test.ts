import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { cardBox, hasQualifiedBanner, hasRemainBanner, nameBand, qualifiedCards } from "./grid";

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

test("a name band sits just above its card", async () => {
  const frame = await frameFrom("src/ocr/samples/grid-5.jpg");
  const box = nameBand(frame, { row: 0, col: 4 });
  const card = cardBox(frame, { row: 0, col: 4 });
  expect(box.y + box.h).toBeLessThanOrEqual(card.y + 4);
  expect(box.h).toBe(19);
});

test("a card box sits on the card, on every row", async () => {
  // An eliminated card is flat magenta, so its own edges are exactly where the row's are. One per
  // row is all this board offers: the rest are green, whose bean art has edges of its own.
  const frame = await frameFrom("fixtures/qualified-board/FallGuys_client_game_NZVl4PC1mk.png");
  const pink: Array<[number, number]> = [
    [0, 0],
    [1, 1],
    [2, 3],
    [3, 0],
  ];

  for (const [row, col] of pink) {
    const box = cardBox(frame, { row, col });
    const x = box.x + Math.round(box.w / 2);
    const filled = [];
    for (let y = box.y - 20; y < box.y + box.h + 20; y++) {
      const [r, g, b] = frame.at(x, y);
      if (r > 180 && b > 120 && g < 110) filled.push(y);
    }
    expect([row, filled.at(0), filled.at(-1)]).toEqual([row, box.y, box.y + box.h - 1]);
  }
});

/**
 * The nameplate was measured off a 1080p capture and written in those pixels, so on a 4K one it cut
 * a band half the height it should and clipped the glyphs. Tesseract read a handful of names
 * perfectly and returned noise for the rest.
 */
test("the name band is the same share of the capture at any size", async () => {
  const shares = await Promise.all(
    [
      "fixtures/qualified-board/FallGuys_client_game_fxbNfcffFv.jpg",
      "fixtures/qualified-board/FallGuys_client_game_3ztjsDJfdF.jpg",
    ].map(async (path) => {
      const frame = await frameFrom(path);
      const cards = qualifiedCards(frame);
      const band = nameBand(frame, cards[0]!);
      return { size: `${frame.width}x${frame.height}`, share: band.h / frame.height };
    }),
  );

  expect(shares.map((s) => s.size)).toEqual(["3840x2160", "1920x1080"]);
  expect(shares[0]!.share).toBeCloseTo(shares[1]!.share, 3);
});

test("the plate reads REMAIN while the board still names everyone, and QUALIFIED once it does not", async () => {
  const remaining = await frameFrom("fixtures/field-board/auto-4-field-232638-1.jpg");
  expect(hasRemainBanner(remaining)).toBe(true);
  expect(hasQualifiedBanner(remaining)).toBe(false);

  const settled = await frameFrom("fixtures/qualified-board/FallGuys_client_game_fxbNfcffFv.jpg");
  expect(hasRemainBanner(settled)).toBe(false);
  expect(hasQualifiedBanner(settled)).toBe(true);
});

test("a level's own pinks are not a plate", async () => {
  for (const file of ["lobby.jpg", "winner.jpg", "toast.jpg"]) {
    expect(hasRemainBanner(await frameFrom(`src/ocr/samples/${file}`))).toBe(false);
  }
});
