import { fieldOf, roundFieldsOf } from "./field";
import { finalistsOf, SCORES_FIRST } from "./rounds";
import { FINAL_WIN, RACE_WIN, REACHED_FINAL, score } from "./scoring";
import type { LeaderboardRow, Players, RoundType, Show, TournamentEvent } from "./types";

export type Placing = "won" | "finalist" | "playing" | "contestant";

export type CellState = "first" | "won" | "through" | "out" | "unknown" | "none";

export interface DetailCell {
  state: CellState;
  map: string;
  type: RoundType;
}

export interface ShowLine {
  /** 1-based, matching the number the results page gives the show. */
  number: number;
  name: string;
  placing: Placing;
  cells: DetailCell[];
  points: number;
}

export interface PlayerDetail {
  row: LeaderboardRow;
  shows: ShowLine[];
}

function cellsOf(
  show: Show,
  players: Players,
  ingame: string,
  finalist: boolean,
  won: boolean,
): DetailCell[] {
  const cells = roundFieldsOf(show, players.players).map((beans, index) => {
    const bean = beans.find((player) => player.ingame === ingame);
    const round = show.rounds[index]!;
    // `playing` off a round means its board was never read, so the round can say nothing about
    // this player either way. Drawing it as a qualification would invent one.
    const state: CellState = !bean
      ? "none"
      : bean.wasFirst
        ? "first"
        : bean.state === "won"
          ? "won"
          : bean.state === "out"
            ? "out"
            : bean.state === "playing"
              ? "unknown"
              : "through";
    return { state, map: round.map, type: round.type };
  });

  // `roundFieldsOf` narrows a decided final to its winners, because the results page names the
  // rest on the round that sent them there. The grid has one cell per round and no such elsewhere,
  // so the final has to speak for everyone who reached it.
  const last = cells.at(-1);
  if (last && show.winners?.length && show.rounds.at(-1)?.type === "final") {
    if (won) last.state = "won";
    else if (finalist) last.state = "out";
  }
  return cells;
}

function pointsOf(show: Show, ingame: string, finalist: boolean, won: boolean): number {
  const firsts = show.rounds.filter(
    (round) => SCORES_FIRST.has(round.type) && round.first === ingame,
  ).length;
  const share = won ? Math.floor(FINAL_WIN / (show.winners?.length ?? 1)) : 0;
  return firsts * RACE_WIN + (finalist ? REACHED_FINAL : 0) + share;
}

/**
 * One player's whole tournament, show by show. `undefined` for anyone off the leaderboard — an
 * admin, a no-show, or a name nobody registered.
 */
export function playerDetail(
  event: TournamentEvent,
  players: Players,
  ingame: string,
): PlayerDetail | undefined {
  const row = score(event, players).find((candidate) => candidate.ingame === ingame);
  if (!row) return undefined;

  const shows = event.shows.map((show, index) => {
    const won = (show.winners ?? []).includes(ingame);
    const finalist = finalistsOf(show).includes(ingame);
    const mine = !ingame
      ? undefined
      : fieldOf(show, players.players).find((player) => player.ingame === ingame);

    // A show typed in short leaves its last round unresolved, which `fieldOf` reads as open. Only
    // the show on the wall can still be holding anyone; every earlier one is simply over.
    const onWall = index === event.shows.length - 1;
    const placing: Placing = won
      ? "won"
      : finalist
        ? "finalist"
        : onWall && mine?.state === "playing"
          ? "playing"
          : "contestant";

    return {
      number: index + 1,
      name: show.name,
      placing,
      cells: ingame ? cellsOf(show, players, ingame, finalist, won) : [],
      points: ingame ? pointsOf(show, ingame, finalist, won) : 0,
    };
  });

  return { row, shows };
}
