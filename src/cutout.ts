/** Anything paler than this, reachable from the border, is the sheet the product was shot on. */
const BACKGROUND = 240;

type Bitmap = { width: number; height: number; data: Uint8Array | Buffer };

function brightest(data: Uint8Array | Buffer, at: number): number {
  return Math.max(data[at]!, data[at + 1]!, data[at + 2]!);
}

/**
 * Cuts the studio white out from around a product shot, leaving it standing on nothing.
 *
 * Only white the border can walk to goes: a white fan blade enclosed by the cooler is part of the
 * picture. What is left over the boundary keeps an alpha off how pale it is, so the anti-aliased
 * pixels the flood cannot claim fade instead of ringing the product in white.
 */
export function cutWhiteBackground(bitmap: Bitmap, tolerance: number = BACKGROUND): void {
  const { data, width, height } = bitmap;
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];

  const consider = (index: number): void => {
    if (outside[index] === 1) return;
    if (brightest(data, index * 4) < tolerance) return;
    outside[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x++) {
    consider(x);
    consider((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    consider(y * width);
    consider(y * width + width - 1);
  }

  while (queue.length > 0) {
    const index = queue.pop()!;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) consider(index - 1);
    if (x < width - 1) consider(index + 1);
    if (y > 0) consider(index - width);
    if (y < height - 1) consider(index + width);
  }

  for (let index = 0; index < outside.length; index++) {
    const at = index * 4;
    if (outside[index] === 1) {
      data[at + 3] = 0;
      continue;
    }
    const x = index % width;
    const y = (index - x) / width;
    const fringe =
      (x > 0 && outside[index - 1] === 1) ||
      (x < width - 1 && outside[index + 1] === 1) ||
      (y > 0 && outside[index - width] === 1) ||
      (y < height - 1 && outside[index + width] === 1);
    if (!fringe) continue;

    // Ramps to fully opaque a little under the cut-off, so only the boundary itself is thinned.
    const fade = Math.round(((tolerance - brightest(data, at)) / 24) * 255);
    data[at + 3] = Math.min(255, Math.max(0, fade));
  }
}
