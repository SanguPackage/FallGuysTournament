import type { Entry } from "./transcript";

/** A line that belongs to a show. A note carries no clock, so it belongs to the evening instead. */
export type ShowLine = Exclude<Entry, { kind: "note" }>;

/** The lines of one show: `from` inclusive, `to` exclusive. */
export function linesBetween(entries: Entry[], from: number, to: number): ShowLine[] {
  return entries.filter(
    (entry): entry is ShowLine => entry.kind !== "note" && entry.at >= from && entry.at < to,
  );
}
