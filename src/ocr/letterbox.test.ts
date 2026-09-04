import { describe, expect, test } from "bun:test";
import { frameFromBitmap } from "./frame";
import { cropBars } from "./letterbox";

/** A frame of `fill`, with black bars of the given thickness painted over its edges. */
function barred(
  width: number,
  height: number,
  bars: { top?: number; bottom?: number; left?: number; right?: number },
  fill: [number, number, number] = [200, 40, 90],
) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bar =
        y < (bars.top ?? 0) ||
        y >= height - (bars.bottom ?? 0) ||
        x < (bars.left ?? 0) ||
        x >= width - (bars.right ?? 0);
      const i = (y * width + x) * 4;
      const [r, g, b] = bar ? [0, 0, 0] : fill;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return frameFromBitmap({ width, height, data });
}

describe("cropBars", () => {
  test("leaves a frame with no bars alone", () => {
    const cropped = cropBars(barred(320, 180, {}));

    expect([cropped.width, cropped.height]).toEqual([320, 180]);
  });

  test("takes the 16:9 picture out of a 16:10 capture", () => {
    const cropped = cropBars(barred(384, 240, { top: 24, bottom: 24 }));

    expect([cropped.width, cropped.height]).toEqual([384, 192]);
  });

  test("reads pixels from inside the picture, not the bar", () => {
    const cropped = cropBars(barred(384, 240, { top: 24, bottom: 24 }, [10, 20, 30]));

    expect(cropped.at(0, 0)).toEqual([10, 20, 30]);
  });

  test("takes side bars too", () => {
    const cropped = cropBars(barred(400, 240, { left: 50, right: 50 }));

    expect([cropped.width, cropped.height]).toEqual([300, 240]);
  });

  test("counts a bar the encoder left just off black", () => {
    const frame = barred(384, 240, {});
    const bar = (x: number, y: number) => (y < 24 || y >= 216 ? ([8, 6, 9] as const) : frame.at(x, y));
    const cropped = cropBars({ width: 384, height: 240, at: bar });

    expect([cropped.width, cropped.height]).toEqual([384, 192]);
  });

  test("leaves a frame that is black all through alone", () => {
    const cropped = cropBars(barred(320, 180, {}, [0, 0, 0]));

    expect([cropped.width, cropped.height]).toEqual([320, 180]);
  });

  /**
   * A dark screen is not a bar. Cropping one moves every measurement the recognizers take, so the
   * benefit of the doubt goes to the frame.
   */
  test("leaves a frame whose picture starts a third of the way down alone", () => {
    const cropped = cropBars(barred(384, 240, { top: 96 }));

    expect([cropped.width, cropped.height]).toEqual([384, 240]);
  });
});
