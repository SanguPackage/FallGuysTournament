import type { Frame } from "./frame";
import type { Box } from "./geometry";

const NAME_X = 1735 / 1920;
const NAME_W = 95 / 1920;
const FIRST_Y = 291 / 1080;
const PITCH = 30 / 1080;
const HEIGHT = 24 / 1080;
const ICON_X = 1820 / 1920;
const ICON_W = 55 / 1920;

/** Enough pills to cover a lobby's worth of qualifiers without running off the screen. */
export const PILLS = 8;

/** The trophy is unmistakably gold; a lone stray pixel is not. */
const GOLD_PIXELS = 40;

/**
 * Gold cannot say a pill is even there: the levels are full of orange scenery, and the victory
 * screen has gold bars right where the icons sit. A pill is its own body — white glyphs on a pale
 * lozenge — so that is what gets looked for first.
 */
const PILL_WHITE = 100;
const PILL_PALE = 500;

export function pillBox(frame: Frame, index: number): Box {
  return {
    x: Math.round(NAME_X * frame.width),
    y: Math.round((FIRST_Y + PITCH * index) * frame.height),
    w: Math.round(NAME_W * frame.width),
    h: Math.round(HEIGHT * frame.height),
  };
}

function goldCount(frame: Frame, index: number): number {
  const box = pillBox(frame, index);
  const x0 = Math.round(ICON_X * frame.width);
  const x1 = x0 + Math.round(ICON_W * frame.width);
  let gold = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = x0; x < x1; x++) {
      const [r, g, b] = frame.at(x, y);
      if (r > 190 && g > 140 && b < 110) gold += 1;
    }
  }
  return gold;
}

export function hasPill(frame: Frame, index: number): boolean {
  const box = pillBox(frame, index);
  let white = 0;
  let pale = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const min = Math.min(...frame.at(x, y));
      if (min > 200) white += 1;
      else if (min > 150) pale += 1;
    }
  }
  return white >= PILL_WHITE && pale >= PILL_PALE;
}

/** Which pill finished first, by its trophy. Position in the column says nothing. */
export function trophyPill(frame: Frame): number | undefined {
  let best: { index: number; gold: number } | undefined;
  for (let index = 0; index < PILLS; index++) {
    if (!hasPill(frame, index)) continue;
    const gold = goldCount(frame, index);
    if (gold >= GOLD_PIXELS && (best === undefined || gold > best.gold)) best = { index, gold };
  }
  return best?.index;
}
