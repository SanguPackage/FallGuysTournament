import type { Entry } from "./transcript";

/**
 * The lines of one show: `from` inclusive, `to` exclusive. A note carries no clock — it is the
 * server talking about itself, which belongs to the evening rather than to any show.
 */
export function linesBetween(
  entries: Entry[],
  from: number,
  to: number,
): Exclude<Entry, { kind: "note" }>[] {
  return entries.filter(
    (entry): entry is Exclude<Entry, { kind: "note" }> =>
      entry.kind !== "note" && entry.at >= from && entry.at < to,
  );
}
