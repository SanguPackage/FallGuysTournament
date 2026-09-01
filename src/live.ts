import type { ShowInOrder } from "../site/rules";
import type { Round, RoundType, TournamentEvent } from "./types";

export interface LiveStatus {
  state: "not-started" | "playing" | "between";
  /** How many shows have been started, which is what the site calls "Show N". */
  showNumber?: number;
  showName?: string;
  /** Zero-based position of the current show in the planned order, or -1 if the order does not list it. */
  orderIndex: number;
  /** The round being played now: one past the last one recorded. */
  round?: number;
  lastRound?: Round;
  /** Whether `lastRound` is the round on screen now rather than the last one recorded. */
  roundLive?: boolean;
  nextShow?: string;
}

export function liveStatus(event: TournamentEvent, order: ShowInOrder[]): LiveStatus {
  const current = event.shows.at(-1);
  if (!current) {
    return { state: "not-started", orderIndex: -1, nextShow: order[0]?.show };
  }

  const orderIndex = order.findIndex((show) => show.show === current.name);
  const finished = (current.winners?.length ?? 0) > 0;

  return {
    state: finished ? "between" : "playing",
    showNumber: event.shows.length,
    showName: current.name,
    orderIndex,
    round: finished ? undefined : current.rounds.length + 1,
    lastRound: current.rounds.at(-1),
    nextShow: orderIndex === -1 ? undefined : order[orderIndex + 1]?.show,
  };
}

/** What the Fall Guys log says is on screen right now. Only the machine running the game knows this. */
export interface LiveNow {
  /** The show being played, named from the plan rather than the log's internal show id. */
  show: string;
  showNumber: number;
  /** Rounds loaded so far, so the one on screen is this many in. */
  round: number;
  map: string | null;
  type: RoundType | null;
  startedAt: string | null;
}

/**
 * Puts the log ahead of what has been typed in, so the board names the show and the round on screen
 * before anybody has recorded a result for them.
 */
export function withLiveLog(
  status: LiveStatus,
  now: LiveNow | null,
  order: ShowInOrder[],
): LiveStatus {
  if (!now) return status;

  const orderIndex = order.findIndex((show) => show.show === now.show);
  const onScreen = now.map !== null && now.type !== null;

  return {
    ...status,
    state: "playing",
    showName: now.show,
    showNumber: now.showNumber,
    orderIndex,
    round: now.round,
    roundLive: onScreen,
    lastRound: onScreen ? { map: now.map!, type: now.type! } : status.lastRound,
    nextShow: orderIndex === -1 ? undefined : order[orderIndex + 1]?.show,
  };
}
