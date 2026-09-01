export type RoundType = "race" | "survival" | "final";

export interface Round {
  map: string;
  type: RoundType;
  /** In-game name of the player who crossed first. Race rounds only. */
  first?: string;
}

export interface Show {
  name: string;
  /** In-game names of everyone who qualified for the final round. */
  finalists?: string[];
  /** In-game names of the final's winners. More than one means a simultaneous win. */
  winners?: string[];
  rounds: Round[];
}

export interface Penalty {
  ingame: string;
  points: number;
  reason: string;
}

export interface TournamentEvent {
  name: string;
  date: string;
  shows: Show[];
  penalties: Penalty[];
}

export interface Player {
  /** Absent until the player reports their in-game name on Discord. */
  ingame?: string;
  fom: string;
  discord?: string;
  /** Admins run the event rather than competing, so they are left off the leaderboard. */
  admin?: boolean;
}

export interface Players {
  players: Player[];
}

export interface LeaderboardRow {
  ingame?: string;
  fom: string;
  points: number;
  raceWins: number;
  finalsReached: number;
  finalsWon: number;
  penaltyPoints: number;
}

export interface SkippedShow {
  show: string;
  reason: string;
}
