import { maskToPng } from "./mask";
import type { Frame } from "./frame";
import type { Box } from "./geometry";

/**
 * The QUALIFIED plate in the top right corner: a dark lozenge carrying "n/m" in white under the
 * word. It is up for the whole of a round and gone the moment the show ends.
 */
const PLATE = { x: 1690 / 1920, w: 220 / 1920, y: 35 / 1080, h: 80 / 1080 };
/** The count, under the word. */
const COUNT = { x: 1690 / 1920, w: 220 / 1920, y: 72 / 1080, h: 42 / 1080 };

/** The glyphs. Every victory screen measures zero here; every round measures a fifth of the plate. */
const GLYPH_SHARE = 0.1;

function boxOf(frame: Frame, rect: typeof PLATE): Box {
  return {
    x: Math.round(rect.x * frame.width),
    y: Math.round(rect.y * frame.height),
    w: Math.round(rect.w * frame.width),
    h: Math.round(rect.h * frame.height),
  };
}

/** Whether a round is on screen, rather than the screen that ends a show. */
export function onRoundHud(frame: Frame): boolean {
  const box = boxOf(frame, PLATE);
  let light = 0;
  let total = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const [r, g, b] = frame.at(x, y);
      total += 1;
      if ((r + g + b) / 3 > 200) light += 1;
    }
  }
  return total > 0 && light / total >= GLYPH_SHARE;
}

export const countBox = (frame: Frame): Box => boxOf(frame, COUNT);

/**
 * How many have qualified so far, as the plate says. Zero means the round has no first place yet,
 * so a pill read off that frame belongs to something else — the eliminated banner, or a nametag.
 */
export function qualifiedFrom(text: string): number | undefined {
  const match = /(\d+)\s*[\/|]\s*(\d+)/.exec(text.replace(/\s+/g, " "));
  return match ? Number(match[1]) : undefined;
}

export async function countPng(frame: Frame): Promise<Buffer> {
  return maskToPng(frame, countBox(frame), 200, 6);
}
