import { Jimp } from "jimp";

export interface Frame {
  width: number;
  height: number;
  /** Red, green and blue at a pixel. Reads outside the frame clamp to the edge. */
  at(x: number, y: number): readonly [number, number, number];
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
