import type { PlayerRange, ShowLimits, SkippedShow } from "./types";

export function limitsFor(limits: ShowLimits, show: string): PlayerRange | undefined {
  const target = show.trim().toLowerCase();
  const match = Object.entries(limits.shows).find(([name]) => name.toLowerCase() === target);
  return match?.[1];
}

/** Creative levels and anything the wiki does not list are left to the admin's judgement. */
export function playable(limits: ShowLimits, show: string, headcount: number): boolean {
  const range = limitsFor(limits, show);
  if (!range) return true;
  return headcount >= range.min && headcount <= range.max;
}

export function playableAt(
  limits: ShowLimits,
  order: string[],
  headcount: number,
): { play: string[]; skip: SkippedShow[] } {
  const play: string[] = [];
  const skip: SkippedShow[] = [];

  for (const show of order) {
    const range = limitsFor(limits, show);
    if (!range || (headcount >= range.min && headcount <= range.max)) {
      play.push(show);
    } else if (headcount < range.min) {
      skip.push({ show, reason: `needs at least ${range.min} players` });
    } else {
      skip.push({ show, reason: `needs at most ${range.max} players` });
    }
  }

  return { play, skip };
}
