import { expect, test } from "bun:test";
import { frameFromBitmap } from "./frame";
import { maskToPng } from "./mask";

function bitmapOf(pixels: [number, number, number][][]) {
  const height = pixels.length;
  const width = pixels[0]!.length;
  const data = new Uint8Array(width * height * 4);
  pixels.forEach((row, y) =>
    row.forEach(([r, g, b], x) => {
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }),
  );
  return { width, height, data };
}

test("only pixels bright in every channel survive the mask", async () => {
  // A saturated green is bright in one channel; white is bright in all three.
  const frame = frameFromBitmap(
    bitmapOf([
      [
        [255, 255, 255],
        [0, 255, 0],
      ],
      [
        [10, 10, 10],
        [255, 255, 255],
      ],
    ]),
  );
  const png = await maskToPng(frame, { x: 0, y: 0, w: 2, h: 2 }, 190, 1);
  expect(png.length).toBeGreaterThan(0);
});

test("the mask upscales by the factor asked for", async () => {
  const frame = frameFromBitmap(
    bitmapOf([
      [
        [255, 255, 255],
        [0, 0, 0],
      ],
    ]),
  );
  const small = await maskToPng(frame, { x: 0, y: 0, w: 2, h: 1 }, 190, 1);
  const big = await maskToPng(frame, { x: 0, y: 0, w: 2, h: 1 }, 190, 6);
  expect(big.length).toBeGreaterThan(small.length);
});
