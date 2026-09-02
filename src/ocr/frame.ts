import { Jimp } from "jimp";

export interface Frame {
  width: number;
  height: number;
  /** Red, green and blue at a pixel. Reads outside the frame clamp to the edge. */
  at(x: number, y: number): readonly [number, number, number];
}

/**
 * A length written as 1080p pixels, in the pixels of the frame at hand. Every screen the game draws
 * scales with the window, so a measurement taken off one capture only holds as a share of it.
 */
export function px(frame: Frame, at1080: number): number {
  return Math.round((at1080 / 1080) * frame.height);
}

export function frameFromBitmap(bitmap: {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
}): Frame {
  const { width, height, data } = bitmap;
  return {
    width,
    height,
    at(x, y) {
      const cx = Math.min(Math.max(x, 0), width - 1);
      const cy = Math.min(Math.max(y, 0), height - 1);
      const i = (cy * width + cx) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    },
  };
}

export async function frameFrom(path: string): Promise<Frame> {
  const image = await Jimp.read(path);
  return frameFromBitmap(image.bitmap);
}
