import book from "../data/rounds.json";
import type { RoundType, Show } from "./types";

/** Offered in the admin's type dropdown, in the order a round is most likely to need correcting. */
export const ROUND_TYPES: readonly RoundType[] = [
  "race",
  "hunt",
  "survival",
  "logic",
  "team",
  "final",
  "unknown",
];

/**
 * The round types the game qualifies players from one at a time, so a first can be recorded.
 * A round no table names is included: it is more often a race than not, and a field the admin can
 * see and clear beats one that is never offered.
 */
export const SCORES_FIRST = new Set<RoundType>(["race", "hunt", "unknown"]);

export interface RoundInfo {
  name: string;
  type: RoundType;
}

const rounds = book.rounds as Record<string, RoundInfo>;

/**
 * The log writes a level id with a variant suffix — `round_tail_tag_solos` for the solo cut of
 * Tail Tag — so the longest id the round starts with is the round itself.
 */
const ids = Object.keys(rounds).sort((a, b) => b.length - a.length);

export function identify(id: string): RoundInfo {
  const match = ids.find((known) => id.startsWith(known));
  return match ? rounds[match]! : { name: id, type: "unknown" };
}

/**
 * Rounds arrive one at a time as they are played, so a show three rounds in has a second-to-last
 * round that is nobody's semi-final. Until the final itself is on the list there are no finalists.
 */
export function finalistsOf(show: Show): string[] {
  if (show.rounds.at(-1)?.type !== "final") return [];
  return show.rounds.at(-2)?.qualified ?? [];
}
