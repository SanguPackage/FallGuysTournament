import type { ShowInOrder } from "../site/rules";
import type { Round, TournamentEvent } from "./types";

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
