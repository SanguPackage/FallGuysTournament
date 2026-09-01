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

/** The name sits in a thin band directly above its card, ending at the card's crown badge. */
export function nameBand(frame: Frame, card: Card): Box {
  const box = cardBox(frame, card);
  const right = box.x + box.w + 4;
  const width = Math.round(cellWidth(frame) * 2.2);
  return { x: right - width, y: box.y - 15, w: width, h: 18 };
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

export function qualifiedCards(frame: Frame): Card[] {
  const cards: Card[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (greenShare(frame, { row, col }) > GREEN_SHARE) cards.push({ row, col });
    }
  }
  return cards;
}
