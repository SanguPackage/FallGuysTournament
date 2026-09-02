import type { Frame } from "./frame";
import { hasQualifiedBanner, qualifiedCards } from "./grid";
import { onRoundHud } from "./hud";
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
 *
 * What sets the rainbow apart is that it is unbroken: every pixel down the edge is saturated,
 * where a level showing through its own colours leaves gaps. The stripes themselves are a weaker
 * signal — how many fall inside the sampled edge varies with the screen, and a lossless capture
 * splits them into fewer bands than a JPEG of the same screen, whose fringing invents one more.
 */
function isWinner(frame: Frame): boolean {
  const x = Math.round(frame.width * 0.004);
  const bands = new Set<number>();
  let saturated = 0;
  let samples = 0;
  for (let y = 0; y < Math.round(frame.height * 0.24); y += 2) {
    samples += 1;
    const band = hueBand(...frame.at(x, y));
    if (band === undefined) continue;
    saturated += 1;
    bands.add(band);
  }
  return samples >= 100 && saturated >= samples * 0.98 && bands.size >= 3;
}

export function identify(frame: Frame): Screen | undefined {
  if (hasQualifiedBanner(frame) && qualifiedCards(frame).length > 0) return "grid";
  // A round still being played and the screen that ends it cannot both be on screen, and the
  // level's own colours fool `isWinner` far more often than the plate goes missing.
  if (onRoundHud(frame)) return trophyPill(frame) !== undefined ? "toast" : undefined;
  if (isWinner(frame)) return "winner";
  return undefined;
}
