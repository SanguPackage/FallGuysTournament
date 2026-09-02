import type { PlacedShot, ShowTimes } from "../screenshots";
import { assign, cleanToken } from "./match";
import type { ShotRead } from "./read";

export interface SlotFill {
  showIndex: number;
  slot: "first" | "qualified" | "winners";
  roundIndex?: number;
  names: string[];
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
): SlotFill[] {
  const fills: SlotFill[] = [];

  for (const shot of shots) {
    const read = reads[shot.file];
    if (!read?.screen || shot.showIndex === undefined || read.tokens.length === 0) continue;

    const names = assign(read.tokens.map(cleanToken), roster)
      .map((match) => match.value)
      .filter(Boolean);
    if (names.length === 0) continue;

    // A board turns up after every round, and lands in the window of the round it followed.
    if (read.screen === "grid") {
      if (shot.roundIndex !== undefined) {
        fills.push({
          showIndex: shot.showIndex,
          slot: "qualified",
          roundIndex: shot.roundIndex,
          names,
          from: shot.file,
        });
      }
      continue;
    }

    if (read.screen === "winner") {
      fills.push({ showIndex: shot.showIndex, slot: "winners", names, from: shot.file });
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
        from: shot.file,
      });
    }
  }

  return fills;
}
