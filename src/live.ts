import type { ShowInOrder } from "../site/rules";
import type { Round, RoundType, TournamentEvent } from "./types";

export interface LiveStatus {
  state: "not-started" | "playing" | "between";
  /** How many shows have been started, which is what the site calls "Show N". */
  showNumber?: number;
  showName?: string;
  /** Zero-based position of the current show in the planned order, or -1 once past its end. */
  orderIndex: number;
  /** The round being played now: one past the last one recorded. */
  round?: number;
  lastRound?: Round;
  /** Whether `lastRound` is the round on screen now rather than the last one recorded. */
  roundLive?: boolean;
  nextShow?: string;
}

/** Zero-based slot the nth show occupies in the plan, or -1 once the plan has run out. */
function positionIn(order: ShowInOrder[], played: number): number {
  return played >= 1 && played <= order.length ? played - 1 : -1;
}

export function liveStatus(event: TournamentEvent, order: ShowInOrder[]): LiveStatus {
  const current = event.shows.at(-1);
  if (!current) {
    return { state: "not-started", orderIndex: -1, nextShow: order[0]?.show };
  }

  // Shows are named after the playlist the log reports, not after the plan, so how many have been
  // played is the only thing that lines them up with the order.
  const orderIndex = positionIn(order, event.shows.length);
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

/**
 * What the show being played is called. The name always comes from what has been recorded, so a
 * rename sticks and keeps sticking; the log's own playlist only stands in until someone writes the
 * show down. Shows are recorded in the order they were played, so the log's position finds it.
 */
export function showNameNow(event: TournamentEvent, index: number, fromLog: string): string {
  return event.shows[index]?.name.trim() || fromLog;
}

/** What the Fall Guys log says is on screen right now. Only the machine running the game knows this. */
export interface LiveNow {
  /** The show being played, named from what has been recorded for it where that exists. */
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

  const orderIndex = positionIn(order, now.showNumber);
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
