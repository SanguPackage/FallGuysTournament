import type { Player, Show } from "./types";

export type FieldState = "won" | "through" | "playing" | "out";

export interface FieldPlayer {
  ingame: string;
  fom: string;
  state: FieldState;
  /** 1-based rounds this player crossed first. */
  firsts: number[];
  /** 1-based round they went out on. Only set when out. */
  outAt?: number;
}

const ORDER: Record<FieldState, number> = { won: 0, through: 1, playing: 1, out: 2 };

/**
 * A player knocked out in round 1 is named on no screen at all, so the roster is the baseline red
 * is measured against: everyone at the LAN plays every show.
 */
export function fieldOf(show: Show, players: Player[]): FieldPlayer[] {
  const roster = players.filter(
    (player): player is Player & { ingame: string } => !player.admin && !!player.ingame,
  );

  const outAt = new Map<string, number>();
  let alive = new Set(roster.map((player) => player.ingame));
  for (const [index, round] of show.rounds.entries()) {
    if (!round.qualified) continue;
    const through = new Set(round.qualified);
    for (const name of alive) if (!through.has(name)) outAt.set(name, index + 1);
    alive = new Set([...alive].filter((name) => through.has(name)));
  }

  const firsts = new Map<string, number[]>();
  for (const [index, round] of show.rounds.entries()) {
    if (!round.first) continue;
    firsts.set(round.first, [...(firsts.get(round.first) ?? []), index + 1]);
  }

  const winners = new Set(show.winners ?? []);
  const finished = winners.size > 0;
  const resolved = show.rounds.findLastIndex((round) => round.qualified !== undefined);
  // Survivors go green when a board is read and grey again the moment the next round loads.
  const open = !finished && (show.rounds.length === 0 || resolved < show.rounds.length - 1);

  const field = roster.map((player) => {
    const round = outAt.get(player.ingame);
    const state: FieldState = winners.has(player.ingame)
      ? "won"
      : round !== undefined
        ? "out"
        : open
          ? "playing"
          : "through";
    return {
      ingame: player.ingame,
      fom: player.fom,
      state,
      firsts: firsts.get(player.ingame) ?? [],
      ...(state === "out" ? { outAt: round } : {}),
    };
  });

  return field.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.ingame.localeCompare(b.ingame));
}
