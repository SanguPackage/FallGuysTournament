import { Jimp } from "jimp";
import type { Frame } from "./frame";
import type { Box } from "./geometry";

/**
 * Black glyphs on white, upscaled. Names are white with a dark outline drawn over green cards,
 * blue frames, magenta cards and open sky within one strip, so a luma threshold cannot separate
 * them and the minimum channel can: white is the only thing high in all three. The bands are
 * around 15px tall, far under what Tesseract reads without help.
 */
export async function maskToPng(
  frame: Frame,
  box: Box,
  cutoff: number,
  scale: number,
): Promise<Buffer> {
  const image = new Jimp({ width: box.w, height: box.h, color: 0xffffffff });
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const [r, g, b] = frame.at(box.x + x, box.y + y);
      const value = Math.min(r, g, b) > cutoff ? 0 : 255;
      const i = (y * box.w + x) * 4;
      image.bitmap.data[i] = value;
      image.bitmap.data[i + 1] = value;
      image.bitmap.data[i + 2] = value;
      image.bitmap.data[i + 3] = 255;
    }
  }
  const grown = image.resize({ w: box.w * scale, h: box.h * scale });
  return (await grown.getBuffer("image/png")) as Buffer;
}
