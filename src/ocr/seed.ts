import type { PlacedShot } from "../screenshots";
import type { Player } from "../types";
import type { ShotRead } from "./read";

/**
 * Whether anybody is signed up to play. Admins run the event rather than competing, a row with no
 * name is one still being typed in, and a row read off a board was nobody's decision — so none of
 * them counts as a roster.
 */
export function anyoneRegistered(players: Player[]): boolean {
  return players.some((player) => !player.admin && !player.seeded && player.ingame);
}

/**
 * The roster a test run should adopt, or `undefined` to leave the file alone.
 *
 * Testing against public solos means a different lobby every show, so the roster follows the show
 * being played: the newest first board wins, and the names the last one left behind are dropped
 * rather than piled onto. Anything typed in by hand is a signup and stops this entirely, which is
 * what game day looks like — the roster is known before anybody plays.
 */
export function seededRoster(
  players: Player[],
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
): Player[] | undefined {
  if (anyoneRegistered(players)) return undefined;

  const boards = shots.flatMap((shot) => {
    const read = reads[shot.file];
    // A capture that landed in no show cannot say which lobby it is the roster of.
    const showIndex = shot.showIndex;
    if (showIndex === undefined || shot.roundIndex !== 0) return [];
    return read?.screen === "grid" && read.tokens.length > 0 ? [{ shot, read, showIndex }] : [];
  });
  // A capture caught before the plate settles has fewer cards green than one caught after it.
  const board = boards.sort(
    (a, b) =>
      b.showIndex - a.showIndex ||
      b.read.tokens.length - a.read.tokens.length ||
      b.shot.takenAt - a.shot.takenAt,
  )[0];
  if (!board) return undefined;

  const kept = players.filter((player) => !player.seeded);
  const known = new Set(kept.map((player) => player.ingame));
  const fresh: Player[] = [];
  for (const ingame of board.read.tokens) {
    if (known.has(ingame)) continue;
    known.add(ingame);
    fresh.push({ ingame, seeded: true });
  }

  if (fresh.length === 0) return undefined;
  // Same names as last time means the same show, and rewriting the file would only churn it.
  const before = players.filter((player) => player.seeded).map((player) => player.ingame);
  const after = fresh.map((player) => player.ingame);
  if (before.length === after.length && before.every((name, at) => name === after[at])) {
    return undefined;
  }
  return [...kept, ...fresh];
}
