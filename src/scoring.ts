import type { LeaderboardRow, Players, TournamentEvent } from "./types";

export const RACE_WIN = 3;
export const REACHED_FINAL = 1;
export const FINAL_WIN = 5;

export function score(event: TournamentEvent, players: Players): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();
  for (const player of players.players) {
    rows.set(player.ingame, {
      ingame: player.ingame,
      fom: player.fom,
      points: 0,
      raceWins: 0,
      finalsReached: 0,
      finalsWon: 0,
      penaltyPoints: 0,
    });
  }

  for (const show of event.shows) {
    for (const round of show.rounds) {
      if (round.type !== "race" || !round.first) continue;
      const row = rows.get(round.first);
      if (!row) continue;
      row.raceWins += 1;
      row.points += RACE_WIN;
    }

    for (const ingame of show.finalists ?? []) {
      const row = rows.get(ingame);
      if (!row) continue;
      row.finalsReached += 1;
      row.points += REACHED_FINAL;
    }

    const winners = show.winners ?? [];
    if (winners.length > 0) {
      const share = Math.floor(FINAL_WIN / winners.length);
      for (const ingame of winners) {
        const row = rows.get(ingame);
        if (!row) continue;
        row.finalsWon += 1;
        row.points += share;
      }
    }
  }

  for (const penalty of event.penalties) {
    const row = rows.get(penalty.ingame);
    if (!row) continue;
    row.penaltyPoints += penalty.points;
    row.points += penalty.points;
  }

  return [...rows.values()];
}
