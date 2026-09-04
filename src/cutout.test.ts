import { expect, test } from "bun:test";
import { Jimp } from "jimp";
import { cutWhiteBackground } from "./cutout";

const W = 0xffffffff;
const K = 0x101010ff;

/** Rows of colours, so a test reads as the little picture it is cutting out. */
function image(rows: number[][]): InstanceType<typeof Jimp> {
  const img = new Jimp({ width: rows[0]!.length, height: rows.length, color: 0 });
  rows.forEach((row, y) => row.forEach((colour, x) => img.setPixelColor(colour, x, y)));
  return img;
}

const alpha = (img: InstanceType<typeof Jimp>, x: number, y: number): number =>
  img.getPixelColor(x, y) & 0xff;

test("the white the product stands on is cut away", () => {
  const img = image([
    [W, W, W],
    [W, K, W],
    [W, W, W],
  ]);
  cutWhiteBackground(img.bitmap);
  expect(alpha(img, 0, 0)).toBe(0);
  expect(alpha(img, 1, 1)).toBe(255);
});

test("white inside the product is kept: only what the border reaches is background", () => {
  const img = image([
    [W, W, W, W, W],
    [W, K, K, K, W],
    [W, K, W, K, W],
    [W, K, K, K, W],
    [W, W, W, W, W],
  ]);
  cutWhiteBackground(img.bitmap);
  expect(alpha(img, 2, 2)).toBe(255);
  expect(alpha(img, 0, 2)).toBe(0);
});

test("a picture with no white border is left whole", () => {
  const img = image([
    [K, K],
    [K, K],
  ]);
  cutWhiteBackground(img.bitmap);
  expect(alpha(img, 0, 0)).toBe(255);
});

test("the shade that counts as background can be loosened", () => {
  const grey = 0xf0f0f0ff;
  const strict = image([[grey, K]]);
  cutWhiteBackground(strict.bitmap, 250);
  expect(alpha(strict, 0, 0)).toBe(255);

  const loose = image([[grey, K]]);
  cutWhiteBackground(loose.bitmap, 230);
  expect(alpha(loose, 0, 0)).toBe(0);
});

test("the edge left behind fades out, so no white halo rings the product", () => {
  const soft = 0xf2f2f2ff;
  const img = image([
    [W, W, W, W],
    [W, soft, K, W],
    [W, W, W, W],
  ]);
  cutWhiteBackground(img.bitmap, 250);
  const edge = alpha(img, 1, 1);
  expect(edge).toBeGreaterThan(0);
  expect(edge).toBeLessThan(255);
});
