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

/**
 * A level id ending in `_final` is that level played as the show's final — Hex-A-Gone is a survival
 * round as `round_floor_fall`, and the final as `round_floor_fall_only_finals_v2_final`. The table
 * still names it; only its type changes.
 *
 * An id the table lists in full is the exception: `round_tunnel_final` is a survival round and the
 * table saying so outranks its own name. So the suffix only speaks where the match was a prefix.
 */
export function identify(id: string): RoundInfo {
  const match = ids.find((known) => id.startsWith(known));
  if (!match) return { name: id, type: id.endsWith("_final") ? "final" : "unknown" };

  const known = rounds[match]!;
  const playedAsFinal = match !== id && id.endsWith("_final");
  return playedAsFinal ? { name: known.name, type: "final" } : known;
}

/**
 * Rounds arrive one at a time as they are played, so a show three rounds in has a second-to-last
 * round that is nobody's semi-final. Until the final itself is on the list there are no finalists.
 */
export function finalistsOf(show: Show): string[] {
  if (show.rounds.at(-1)?.type !== "final") return [];
  return show.rounds.at(-2)?.qualified ?? [];
}
