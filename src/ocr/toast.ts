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

/**
 * The ELIMINATED banner drops into the same corner as the qualified column and covers its first
 * rows. It carries a name, and a player who is wearing a crown carries gold beside it, so without
 * this the bean that just went out gets read as the one who finished first.
 *
 * Real toast rows measure under 0.03 here; the banner fills a row completely.
 */
const ELIMINATED_MAGENTA = 0.5;
/** How many rows down the banner reaches. */
const BANNER_ROWS = 3;

function isMagenta(r: number, g: number, b: number): boolean {
  return r > 170 && b > 90 && r - g > 70 && b - g > 30;
}

export function hasEliminatedBanner(frame: Frame): boolean {
  for (let index = 0; index < BANNER_ROWS; index++) {
    const box = pillBox(frame, index);
    const x0 = Math.max(0, box.x - Math.round(frame.width * 0.12));
    const x1 = Math.min(frame.width, box.x + box.w + Math.round(frame.width * 0.05));
    let hit = 0;
    let total = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = x0; x < x1; x += 2) {
        total += 1;
        if (isMagenta(...frame.at(x, y))) hit += 1;
      }
    }
    if (total > 0 && hit / total >= ELIMINATED_MAGENTA) return true;
  }
  return false;
}

/**
 * How many pills are stacked from the top of the column with no gap.
 *
 * The column fills downwards from the first slot, so a real toast is always contiguous from 0. The
 * 3D nametags that follow beans around a level trip `hasPill` wherever they happen to be standing,
 * and land on a scattered slot — index 4 with 1, 2 and 3 empty is a nametag, not a toast.
 */
function stackHeight(frame: Frame): number {
  let height = 0;
  while (height < PILLS && hasPill(frame, height)) height += 1;
  return height;
}

/**
 * Which pill finished first, by its trophy, or nothing if this is not a toast column at all.
 * Position within the column says nothing about who was first — only the trophy does.
 */
export function trophyPill(frame: Frame): number | undefined {
  if (hasEliminatedBanner(frame)) return undefined;
  const stack = stackHeight(frame);
  if (stack === 0) return undefined;

  let best: { index: number; gold: number } | undefined;
  for (let index = 0; index < stack; index++) {
    const gold = goldCount(frame, index);
    if (gold >= GOLD_PIXELS && (best === undefined || gold > best.gold)) best = { index, gold };
  }
  return best?.index;
}
