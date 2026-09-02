import type { Frame } from "./frame";
import type { Box } from "./geometry";

/** Measured off a 1920x1080 capture, held as fractions so another size still lands. */
const LEFT = 435 / 1920;
const RIGHT = 1492 / 1920;
const TOP = 225 / 1080;
const PITCH = 144 / 1080;
export const COLS = 8;
export const ROWS = 4;

/** A green card is mostly bean, so this is the share of card left showing, not a majority. */
const GREEN_SHARE = 0.07;

/**
 * Inside the "N QUALIFIED!" banner, clear of its rounded ends and of the white lettering.
 * Measured off a 1920x1080 capture.
 */
const BANNER = { x: 0.3, y: 0.075, w: 0.4, h: 0.075 };
/**
 * Real boards measure 0.65 and up here; gameplay, the lobby, the winner screen and the toast all
 * measure under 0.01. Nothing lands in between, so the threshold sits in the middle of the gap.
 */
const BANNER_SHARE = 0.35;

/** Flat, bright and far greener than any bean, scenery or slime. */
function bannerGreen(r: number, g: number, b: number): boolean {
  return g > 170 && g - r > 70 && g - b > 70;
}

/**
 * Whether the qualification board is on screen at all.
 *
 * The cells are fixed rectangles tested for green, which a green bean on pink slime satisfies just
 * as well as a qualified card does — so without this, ordinary gameplay reads as a board full of
 * qualifiers. The banner is the one part of the screen no level can imitate.
 */
export function hasQualifiedBanner(frame: Frame): boolean {
  const x0 = Math.round(BANNER.x * frame.width);
  const x1 = Math.round((BANNER.x + BANNER.w) * frame.width);
  const y0 = Math.round(BANNER.y * frame.height);
  const y1 = Math.round((BANNER.y + BANNER.h) * frame.height);

  let hit = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      total += 1;
      if (bannerGreen(...frame.at(x, y))) hit += 1;
    }
  }
  return total > 0 && hit / total >= BANNER_SHARE;
}

export interface Card {
  row: number;
  col: number;
}

function isGreen(r: number, g: number, b: number): boolean {
  return g > 120 && g - r > 40 && g - b > 40;
}

function cellWidth(frame: Frame): number {
  return ((RIGHT - LEFT) * frame.width) / COLS;
}

export function cardBox(frame: Frame, card: Card): Box {
  const cw = cellWidth(frame);
  const pitch = PITCH * frame.height;
  return {
    x: Math.round(LEFT * frame.width + cw * card.col),
    y: Math.round(TOP * frame.height + pitch * card.row),
    w: Math.round(cw),
    h: Math.round(pitch),
  };
}

/**
 * The name sits in a thin band directly above its card, ending at the card's crown badge and
 * reaching left as far as a long name needs. A qualified card to the left has a name of its own in
 * that space, so the band stops at its badge rather than swallowing it.
 */
export function nameBand(frame: Frame, card: Card, alsoQualified: Card[] = []): Box {
  const box = cardBox(frame, card);
  const right = box.x + box.w + 4;
  const reach = Math.round(cellWidth(frame) * 2.2);

  const neighbour = alsoQualified
    .filter((other) => other.row === card.row && other.col < card.col)
    .sort((a, b) => b.col - a.col)[0];
  const floor = neighbour ? cardBox(frame, neighbour).x + cardBox(frame, neighbour).w + 4 : 0;

  const x = Math.max(right - reach, floor);
  return { x, y: box.y - 15, w: right - x, h: 18 };
}

function greenShare(frame: Frame, card: Card): number {
  const box = cardBox(frame, card);
  const inset = Math.round(box.w * 0.12);
  let hit = 0;
  let total = 0;
  for (let y = box.y + 14; y < box.y + box.h - 14; y += 3) {
    for (let x = box.x + inset; x < box.x + box.w - inset; x += 3) {
      total += 1;
      if (isGreen(...frame.at(x, y))) hit += 1;
    }
  }
  return total === 0 ? 0 : hit / total;
}

/** Which cards are green. Only meaningful once `hasQualifiedBanner` says a board is there. */
export function qualifiedCards(frame: Frame): Card[] {
  const cards: Card[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (greenShare(frame, { row, col }) > GREEN_SHARE) cards.push({ row, col });
    }
  }
  return cards;
}
