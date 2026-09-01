import book from "../data/rounds.json";
import type { RoundType } from "./types";

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
