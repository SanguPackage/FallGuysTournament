import { Jimp } from "jimp";
import type { Frame } from "./frame";
import type { Box } from "./geometry";

/**
 * Black glyphs on white, upscaled. Names are white with a dark outline drawn over green cards,
 * blue frames, magenta cards and open sky within one strip, so a luma threshold cannot separate
 * them and the minimum channel can: white is the only thing high in all three. The bands are
 * around 15px tall, far under what Tesseract reads without help.
 */
/** Quiet space left around the band: a glyph pressed against the border is one Tesseract drops. */
export const MARGIN = 6;

export async function maskToPng(
  frame: Frame,
  box: Box,
  cutoff: number,
  scale: number,
): Promise<Buffer> {
  const width = box.w + MARGIN * 2;
  const height = box.h + MARGIN * 2;
  const image = new Jimp({ width, height, color: 0xffffffff });

  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const [r, g, b] = frame.at(box.x + x, box.y + y);
      const value = Math.min(r, g, b) > cutoff ? 0 : 255;
      const i = ((y + MARGIN) * width + (x + MARGIN)) * 4;
      image.bitmap.data[i] = value;
      image.bitmap.data[i + 1] = value;
      image.bitmap.data[i + 2] = value;
      image.bitmap.data[i + 3] = 255;
    }
  }

  const grown = image.resize({ w: width * scale, h: height * scale });
  return (await grown.getBuffer("image/png")) as Buffer;
}
