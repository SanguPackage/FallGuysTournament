import type { Entry } from "./transcript";

/**
 * The lines of one show: `from` inclusive, `to` exclusive. A note carries no clock — it is the
 * server talking about itself, which belongs to the evening rather than to any show.
 */
export type ShowLine = Exclude<Entry, { kind: "note" }>;

export function linesBetween<T extends Entry>(
  entries: T[],
  from: number,
  to: number,
): Exclude<T, { kind: "note" }>[] {
  return entries.filter(
    (entry): entry is Exclude<T, { kind: "note" }> =>
      entry.kind !== "note" && entry.at >= from && entry.at < to,
  );
}
