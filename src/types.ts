/** The game's own round categories, plus `unknown` for a round no published table names. */
export type RoundType =
  | "race"
  | "hunt"
  | "survival"
  | "logic"
  | "team"
  | "final"
  | "unknown";

export interface Round {
  map: string;
  type: RoundType;
  /** In-game name of the player who crossed first. Race rounds only. */
  first?: string;
  /** In-game names off the qualification board that came up after this round. */
  qualified?: string[];
  /**
   * How many the log counted through this round. It knows the number without ever knowing a name,
   * so this fills the board for a round nobody has read the survivors off yet.
   */
  survivors?: number;
}

export interface Show {
  name: string;
  /** In-game names of the final's winners. More than one means a simultaneous win. */
  winners?: string[];
  rounds: Round[];
  /** Ticked off by the admin as read back against the captures and correct. */
  checked?: boolean;
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
  /** Absent or true for everyone playing. False keeps a registered no-show out of the tournament. */
  joined?: boolean;
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
