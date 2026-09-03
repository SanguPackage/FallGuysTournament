import type { TournamentEvent } from "./types";

/**
 * Every in-game name the event file holds, from every screen a name is typed off: the trophy pill,
 * the qualification board and the winner screen.
 */
export function namesIn(event: TournamentEvent): string[] {
  const found: string[] = [];
  for (const show of event.shows ?? []) {
    for (const round of show.rounds ?? []) {
      if (round.first) found.push(round.first);
      found.push(...(round.qualified ?? []));
    }
    found.push(...(show.winners ?? []));
  }
  return sorted(found);
}

/**
 * The list only grows. A name typed once is worth keeping even after the show it came from is
 * retyped, because the capture it was read off is what the list is an answer key for.
 */
export function mergeNames(existing: string[], found: string[]): string[] {
  return sorted([...existing, ...found]);
}

/** Case-insensitive so the file reads alphabetically, but two casings are two names. */
function sorted(names: string[]): string[] {
  const kept = new Set(names.map((name) => name.trim()).filter((name) => name.length > 0));
  return [...kept].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }) || (a < b ? -1 : 1));
}
