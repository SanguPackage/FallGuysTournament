export interface ParsedRound {
  id: string;
  /** Local clock time the round finished loading, as the log writes it. Absent on an unstamped line. */
  startedAt?: string;
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
      const id = Number(progress[1]);
      if (progress[2] === "True") round.qualified.push(id);
      else round.eliminated.push(id);
      continue;
    }

    const winner = WINNER.exec(line);
    if (winner) show.winnerId = Number(winner[1]);
  }

  for (const show of shows) {
    const last = show.rounds.at(-1);
    if (last) last.isFinal = true;
    for (const round of show.rounds) {
      round.present.sort((a, b) => a - b);
      round.timedOut = round.qualified.length === 0 && round.eliminated.length > 0;
    }
  }

  return shows;
}
