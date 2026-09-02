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

type Rostered = Player & { ingame: string };

function rosterOf(players: Player[]): Rostered[] {
  return players.filter(
    (player): player is Rostered => !player.admin && player.joined !== false && !!player.ingame,
  );
}

function firstsIn(show: Show): Map<string, number[]> {
  const firsts = new Map<string, number[]>();
  for (const [index, round] of show.rounds.entries()) {
    if (!round.first) continue;
    firsts.set(round.first, [...(firsts.get(round.first) ?? []), index + 1]);
  }
  return firsts;
}

function byState(a: FieldPlayer, b: FieldPlayer): number {
  return ORDER[a.state] - ORDER[b.state] || a.ingame.localeCompare(b.ingame);
}

/**
 * A player knocked out in round 1 is named on no screen at all, so the roster is the baseline red
 * is measured against: everyone at the LAN plays every show.
 */
export function fieldOf(show: Show, players: Player[]): FieldPlayer[] {
  const roster = rosterOf(players);

  const outAt = new Map<string, number>();
  let alive = new Set(roster.map((player) => player.ingame));
  for (const [index, round] of show.rounds.entries()) {
    if (!round.qualified) continue;
    const through = new Set(round.qualified);
    for (const name of alive) if (!through.has(name)) outAt.set(name, index + 1);
    alive = new Set([...alive].filter((name) => through.has(name)));
  }

  const firsts = firstsIn(show);
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

  return field.sort(byState);
}

/**
 * One badge list per round: who that round took, rather than where everybody ended up. A round
 * whose board nobody read cannot name its dead, so it shows everyone still in and its casualties
 * surface on the next round that was read.
 */
export function roundFieldsOf(show: Show, players: Player[]): FieldPlayer[][] {
  const firsts = firstsIn(show);
  const winners = new Set(show.winners ?? []);

  const bean = (player: Rostered, state: FieldState): FieldPlayer => ({
    ingame: player.ingame,
    fom: player.fom,
    state,
    firsts: firsts.get(player.ingame) ?? [],
  });

  let alive = rosterOf(players);
  return show.rounds.map((round) => {
    if (round.type === "final" && winners.size > 0) {
      const beans = alive.map((p) => bean(p, winners.has(p.ingame) ? "won" : "out"));
      alive = alive.filter((p) => winners.has(p.ingame));
      return beans.sort(byState);
    }
    if (!round.qualified) return alive.map((p) => bean(p, "playing")).sort(byState);

    const through = new Set(round.qualified);
    const beans = alive.filter((p) => !through.has(p.ingame)).map((p) => bean(p, "out"));
    alive = alive.filter((p) => through.has(p.ingame));
    return beans.sort(byState);
  });
}
