import { finalistsOf, SCORES_FIRST } from "./rounds";
import type { LeaderboardRow, Players, TournamentEvent } from "./types";

export const RACE_WIN = 3;
export const REACHED_FINAL = 1;
export const FINAL_WIN = 5;


export function score(event: TournamentEvent, players: Players): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();
  const byIngame = new Map<string, LeaderboardRow>();
  for (const player of players.players) {
    if (player.admin || player.joined === false) continue;
    const row: LeaderboardRow = {
      ingame: player.ingame,
      fom: player.fom,
      ...(player.crownRank === undefined ? {} : { crownRank: player.crownRank }),
      points: 0,
      raceWins: 0,
      finalsReached: 0,
      finalsWon: 0,
      penaltyPoints: 0,
    };
    rows.set(player.fom, row);
    if (player.ingame) byIngame.set(player.ingame, row);
  }

  for (const show of event.shows) {
    for (const round of show.rounds) {
      if (!SCORES_FIRST.has(round.type) || !round.first) continue;
      const row = byIngame.get(round.first);
      if (!row) continue;
      row.raceWins += 1;
      row.points += RACE_WIN;
    }

    for (const ingame of finalistsOf(show)) {
      const row = byIngame.get(ingame);
      if (!row) continue;
      row.finalsReached += 1;
      row.points += REACHED_FINAL;
    }

    const winners = show.winners ?? [];
    if (winners.length > 0) {
      const share = Math.floor(FINAL_WIN / winners.length);
      for (const ingame of winners) {
        const row = byIngame.get(ingame);
        if (!row) continue;
        row.finalsWon += 1;
        row.points += share;
      }
    }
  }

  for (const penalty of event.penalties) {
    const row = byIngame.get(penalty.ingame);
    if (!row) continue;
    row.penaltyPoints += penalty.points;
    row.points += penalty.points;
  }

  return [...rows.values()].sort(compareRows);
}

function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  return (
    b.points - a.points ||
    b.finalsWon - a.finalsWon ||
    b.finalsReached - a.finalsReached ||
    b.raceWins - a.raceWins ||
    a.fom.localeCompare(b.fom)
  );
}
