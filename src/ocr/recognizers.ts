import type { Frame } from "./frame";
import { qualifiedCards } from "./grid";
import { trophyPill } from "./toast";

export type Screen = "grid" | "winner" | "toast";

/** Hue as a coarse band, so a colour survives JPEG without being counted twice. */
function hueBand(r: number, g: number, b: number): number | undefined {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 60 || max < 90) return undefined;
  const hue =
    max === r
      ? (60 * ((g - b) / (max - min)) + 360) % 360
      : max === g
        ? 60 * ((b - r) / (max - min)) + 120
        : 60 * ((r - g) / (max - min)) + 240;
  return Math.floor(hue / 40);
}

/**
 * The victory screen is the only one wearing a rainbow down its left edge. The nameplate is no
 * help — it is the winner's own banner art, so its colours are whatever they chose.
 */
function isWinner(frame: Frame): boolean {
  const x = Math.round(frame.width * 0.004);
  const bands = new Set<number>();
  let saturated = 0;
  for (let y = 0; y < Math.round(frame.height * 0.24); y += 2) {
    const band = hueBand(...frame.at(x, y));
    if (band === undefined) continue;
    saturated += 1;
    bands.add(band);
  }
  return saturated >= 100 && bands.size >= 4;
}

export function identify(frame: Frame): Screen | undefined {
  if (qualifiedCards(frame).length > 0) return "grid";
  if (isWinner(frame)) return "winner";
  if (trophyPill(frame) !== undefined) return "toast";
  return undefined;
}
