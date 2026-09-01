import type { LeaderboardRow, Players, TournamentEvent } from "./types";

export const RACE_WIN = 3;

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
  }

  return [...rows.values()];
}
