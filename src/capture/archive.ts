import type { Show } from "../types";

const BASE = "deleted-show";

const pad = (n: number) => String(n).padStart(2, "0");

export interface ArchivedShow {
  deletedAt: string;
  /** The slot it was popped from. A show's own name need not say which it held. */
  showIndex: number;
  show: Show;
}

const NUMBERED = /^deleted-show-(\d+)\.json$/;

/**
 * What to call the archive in a show's own folder. A show can be re-entered, misfire again and be
 * deleted again, so the second delete is numbered rather than landing on the first.
 *
 * Counted past the highest rather than into the first free number: the numbers are what say which
 * delete came first, and one dropped into a gap would claim to have come before the archive that
 * actually preceded it.
 */
export function archiveName(existing: string[]): string {
  if (!existing.includes(`${BASE}.json`)) return `${BASE}.json`;

  const highest = existing.reduce((top, name) => {
    const numbered = NUMBERED.exec(name);
    return numbered ? Math.max(top, Number(numbered[1])) : top;
  }, 1);
  return `${BASE}-${pad(highest + 1)}.json`;
}

/**
 * Where a show with no folder of its own goes: one whose first round never loaded was never given
 * a folder to be named after. Refusing the delete would be worse than an archive off to one side.
 */
export function strayArchiveName(date: string, showIndex: number): string {
  return `${BASE}-${date}-${pad(showIndex + 1)}.json`;
}

export function archivedShow(show: Show, showIndex: number, at: number): ArchivedShow {
  return { deletedAt: new Date(at).toISOString(), showIndex, show };
}
