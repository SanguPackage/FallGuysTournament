import { px, type Frame } from "./frame";
import type { Box } from "./geometry";

/** Measured off a 1920x1080 capture, held as fractions so another size still lands. */
const LEFT = 435 / 1920;
const RIGHT = 1492 / 1920;
const TOP = 235 / 1080;
const PITCH = 145 / 1080;
const CARD_HEIGHT = 122 / 1080;
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
  return {
    x: Math.round(LEFT * frame.width + cw * card.col),
    y: Math.round((TOP + PITCH * card.row) * frame.height),
    w: Math.round(cw),
    h: Math.round(CARD_HEIGHT * frame.height),
  };
}

/**
 * How far above the card the name starts, and how tall it is. There is barely a pixel between the
 * bottom of the card's controller icon and the top of the name, and the descenders of `g`, `j` and
 * `y` run to within five pixels of the card, so the band has no room to spare at either end.
 */
const BAND_ABOVE = 23;
const BAND_HEIGHT = 19;
/** Past the card either side, so a nameplate that overhangs it is not clipped. */
const BAND_OVERHANG = 4;

/**
 * The band above a card holding its nameplate — the name, then the crown's level badge. The pair
 * is centred over the card and never runs past it, so the band is the card's own column and
 * nothing outside it is worth reading: on the rightmost column that is open sky. The badge stays
 * in, being a number after a space, which `dropLevel` takes off.
 */
export function nameBand(frame: Frame, card: Card): Box {
  const box = cardBox(frame, card);
  const overhang = px(frame, BAND_OVERHANG);
  return {
    x: box.x - overhang,
    y: box.y - px(frame, BAND_ABOVE),
    w: box.w + overhang * 2,
    h: px(frame, BAND_HEIGHT),
  };
}

/** Off the card's rounded corners and its frame, which are no part of the fill. */
const CARD_INSET = 6;

function greenShare(frame: Frame, card: Card): number {
  const box = cardBox(frame, card);
  const inset = Math.round(box.w * 0.12);
  const top = px(frame, CARD_INSET);
  let hit = 0;
  let total = 0;
  for (let y = box.y + top; y < box.y + box.h - top; y += 3) {
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
