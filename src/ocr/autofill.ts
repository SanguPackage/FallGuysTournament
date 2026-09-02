import { aliveInto } from "../field";
import type { PlacedShot, ShowTimes } from "../screenshots";
import type { Show } from "../types";
import { assign, cleanToken } from "./match";
import type { ShotRead } from "./read";

export interface SlotFill {
  showIndex: number;
  slot: "first" | "qualified" | "winners";
  roundIndex?: number;
  names: string[];
  /**
   * Whether each name is a roster entry or the text as it was read. Everyone in the tournament is
   * registered, so one the roster did not claim is worth a look rather than a green tick.
   */
  matched: boolean[];
  /** The capture the names were read off, so a wrong one can be traced back. */
  from: string;
}

/**
 * How late the log may stamp the qualify it is reporting. The pill cannot be on screen before
 * anyone has finished, so a capture earlier than that names something else.
 */
const STAMP_GRACE = 2_000;

export function fillsFor(
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
  roster: string[],
  times: ShowTimes[] = [],
  shows: Show[] = [],
): SlotFill[] {
  const fills: SlotFill[] = [];

  for (const shot of shots) {
    const read = reads[shot.file];
    if (!read?.screen || shot.showIndex === undefined || read.tokens.length === 0) continue;

    // Only a show the admin has ticked off is read as complete: until then a board with half its
    // names typed in would drop the rest of the lobby out of the pool, answer key and all.
    const show = shows[shot.showIndex];
    const pool = show?.checked
      ? aliveInto(show, roster, shot.roundIndex ?? show.rounds.length)
      : roster;

    const assigned = assign(read.tokens.map(cleanToken), pool).filter((match) => match.value);
    if (assigned.length === 0) continue;
    const names = assigned.map((match) => match.value);
    const matched = assigned.map((match) => match.name !== undefined);

    // A board turns up after every round, and lands in the window of the round it followed.
    if (read.screen === "grid") {
      if (shot.roundIndex !== undefined) {
        fills.push({
          showIndex: shot.showIndex,
          slot: "qualified",
          roundIndex: shot.roundIndex,
          names,
          matched,
          from: shot.file,
        });
      }
      continue;
    }

    if (read.screen === "winner") {
      fills.push({ showIndex: shot.showIndex, slot: "winners", names, matched, from: shot.file });
      continue;
    }

    if (shot.roundIndex !== undefined) {
      // Until the round's first qualifier the plate reads 0 and there is no pill: whatever was read
      // is the eliminated banner, or a nametag the level happened to park in the column.
      const firstAt = times[shot.showIndex]?.firsts[shot.roundIndex];
      if (firstAt !== undefined && shot.takenAt < firstAt - STAMP_GRACE) continue;

      fills.push({
        showIndex: shot.showIndex,
        slot: "first",
        roundIndex: shot.roundIndex,
        names: [names[0]!],
        matched: [matched[0]!],
        from: shot.file,
      });
    }
  }

  return fills;
}
