import type { ShowInOrder } from "../site/rules";
import type { SkippedShow } from "./types";

export function playableAt(
  order: ShowInOrder[],
  headcount: number,
): { play: ShowInOrder[]; skip: SkippedShow[] } {
  const play: ShowInOrder[] = [];
  const skip: SkippedShow[] = [];

  for (const show of order) {
    if (headcount < show.min) {
      skip.push({ show: show.show, reason: `needs at least ${show.min} players` });
    } else if (headcount > show.max) {
      skip.push({ show: show.show, reason: `needs at most ${show.max} players` });
    } else {
      play.push(show);
    }
  }

  return { play, skip };
}
