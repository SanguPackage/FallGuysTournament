import { identify } from "./rounds";
import type { RoundType } from "./types";

export interface ParsedRound {
  id: string;
  /** The round's published name, or the raw id when no table names it. */
  name: string;
  /** What the round is normally played as. The show's last round is a final whatever it says. */
  type: RoundType;
  /** Local clock time the round finished loading, as the log writes it. Absent on an unstamped line. */
  startedAt?: string;
  /** When the server last reported a result, which is when play stopped and the screen came up. */
  endedAt?: string;
  /** When the round's first qualifier came in, which is when the trophy pill appeared. */
  firstQualifiedAt?: string;
  isFinal: boolean;
  timedOut: boolean;
  /** Everyone who started the round. For the final, this is the set of finalists. */
  present: number[];
  /** playerIDs in the order the server reported them qualifying. */
  qualified: number[];
  eliminated: number[];
}

export interface ParsedShow {
  showId: string;
  /** Local clock time the show was selected. Absent on an unstamped line. */
  startedAt?: string;
  /** Lobby size at the start of the show. Absent outside private lobbies. */
  players?: number;
  /** The client running the log, so the referee can be told apart from the field. */
  localPlayerId?: number;
  rounds: ParsedRound[];
  winnerId?: number;
  /** Local clock time the victory scene came up. Absent on an unstamped line. */
  wonAt?: string;
}

const LOBBY_SIZE = /players in queued reached: (\d+) players/;
const SHOW = /\[HandleSuccessfulLogin\] Selected show is (\S+)/;
/** Covers UGC rounds too, which log no "Game level to load" line. */
const AT = /^(\d\d:\d\d:\d\d)\.\d+: /;
const ROUND = /Finished loading game level, assumed to be ([^.]+)\./;
const LOCAL_PLAYER = /bootstrap for local player .*playerID = (\d+)/;
const BOOTSTRAP = /bootstrap for (?:local|remote) player .*playerID = (\d+)/;
const PROGRESS = /HandleServerPlayerProgress PlayerId=(\d+) is succeeded=(True|False)/;
const WINNER = /VictoryScene::winnerPlayerId:(\d+)/;

/** The only lines carrying a date, and they carry it in local time next to the UTC clock stamp. */
const DATED = /^(\d\d):(\d\d):(\d\d)\.\d+: (\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)/;

const secondsOfDay = (h: string, m: string, s: string) =>
  Number(h) * 3600 + Number(m) * 60 + Number(s);

/**
 * The UTC day every stamp in the log belongs to, which is the day a capture's mtime has to be
 * measured against. Stamps are UTC with no date and the dated lines are local, so the gap between
 * the two clocks on one such line is the offset that turns its local date back into the UTC one.
 */
export function logDate(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const found = DATED.exec(line);
    if (!found) continue;
    const [, utcH, utcM, utcS, date, localH, localM, localS] = found;
    const wall = Date.parse(`${date}T${localH}:${localM}:${localS}Z`);

    // The two clocks are read a moment apart, and no zone is off by a fraction of a quarter hour.
    let offset = secondsOfDay(localH!, localM!, localS!) - secondsOfDay(utcH!, utcM!, utcS!);
    offset = Math.round(offset / 900) * 900;
    if (offset > 14 * 3600) offset -= 86_400;
    if (offset < -12 * 3600) offset += 86_400;

    return new Date(wall - offset * 1000).toISOString().slice(0, 10);
  }
  return undefined;
}

export function parseLog(text: string): ParsedShow[] {
  const shows: ParsedShow[] = [];
  let lobbySize: number | undefined;

  for (const line of text.split("\n")) {
    const show = shows.at(-1);
    const round = show?.rounds.at(-1);
    const at = AT.exec(line)?.[1];

    const size = LOBBY_SIZE.exec(line);
    if (size) {
      lobbySize = Number(size[1]);
      continue;
    }

    const started = SHOW.exec(line);
    if (started) {
      shows.push({
        showId: started[1]!,
        ...(at === undefined ? {} : { startedAt: at }),
        ...(lobbySize === undefined ? {} : { players: lobbySize }),
        rounds: [],
      });
      lobbySize = undefined;
      continue;
    }

    if (!show) continue;

    const loaded = ROUND.exec(line);
    if (loaded) {
      show.rounds.push({
        id: loaded[1]!,
        ...identify(loaded[1]!),
        ...(at === undefined ? {} : { startedAt: at }),
        isFinal: false,
        timedOut: false,
        present: [],
        qualified: [],
        eliminated: [],
      });
      continue;
    }

    const bootstrap = BOOTSTRAP.exec(line);
    if (bootstrap) {
      const local = LOCAL_PLAYER.exec(line);
      if (local) show.localPlayerId = Number(local[1]);
      const id = Number(bootstrap[1]);
      if (round && !round.present.includes(id)) round.present.push(id);
      continue;
    }

    const progress = PROGRESS.exec(line);
    if (progress && round) {
      if (at !== undefined) round.endedAt = at;
      const id = Number(progress[1]);
      if (progress[2] === "True") {
        if (round.qualified.length === 0 && at !== undefined) round.firstQualifiedAt = at;
        round.qualified.push(id);
      } else {
        round.eliminated.push(id);
      }
      continue;
    }

    const winner = WINNER.exec(line);
    if (winner) {
      show.winnerId = Number(winner[1]);
      if (at !== undefined) show.wonAt = at;
    }
  }

  shows.forEach((show, index) => {
    const last = show.rounds.at(-1);
    // Rounds arrive as they load, so the last one on the list is the one being played. It is only
    // the show's final once the show has stopped: a victory scene named a winner, or the lobby
    // moved on to another show. Until then it keeps its own type, and a race keeps its first place.
    const over = show.wonAt !== undefined || index < shows.length - 1;
    if (last && (over || last.type === "final")) {
      last.isFinal = true;
      last.type = "final";
    }
    for (const round of show.rounds) {
      round.present.sort((a, b) => a - b);
      round.timedOut = round.qualified.length === 0 && round.eliminated.length > 0;
    }
  });

  return shows;
}
