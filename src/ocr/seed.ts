import { cleanToken } from "./match";
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

  const settled = settledShows(shots, reads);
  const boards = shots.flatMap((shot) => {
    const read = reads[shot.file];
    // A capture that landed in no show cannot say which lobby it is the roster of.
    const showIndex = shot.showIndex;
    if (showIndex === undefined || shot.roundIndex !== 0 || !settled.has(showIndex)) return [];
    return read?.screen === "grid" && read.tokens.length > 0 ? [{ shot, read, showIndex }] : [];
  });
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
  for (const ingame of board.read.tokens.map(cleanToken)) {
    if (!ingame || known.has(ingame)) continue;
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

/**
 * The shows whose first round has been read to the end, board and all. A capture caught before the
 * plate settles has fewer cards green than one caught after it, so which board holds the lobby is
 * only worth asking once every capture of that round is in.
 */
function settledShows(shots: PlacedShot[], reads: Record<string, ShotRead>): Set<number> {
  const pending = new Set<number>();
  const boards = new Set<number>();
  for (const shot of shots) {
    if (shot.showIndex === undefined || shot.roundIndex !== 0) continue;
    const read = reads[shot.file];
    if (!read) pending.add(shot.showIndex);
    else if (read.screen === "grid" && read.tokens.length > 0) boards.add(shot.showIndex);
  }
  return new Set([...boards].filter((show) => !pending.has(show)));
}

/**
 * The captures a fill may be written from. A test run learns its lobby off the first board of the
 * show being played, and the roster is the answer key the reading is scored against — so a capture
 * from a show whose board is not in yet has nothing to be checked against, and the name it offers
 * would go in as it was misread. Every player in a tournament is registered before anyone plays,
 * so nothing is ever held back there.
 */
export function fillableShots(
  players: Player[],
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
): PlacedShot[] {
  if (anyoneRegistered(players)) return shots;
  const seeded = [...settledShows(shots, reads)].sort((a, b) => b - a)[0];
  if (seeded === undefined) return [];
  return shots.filter((shot) => shot.showIndex !== undefined && shot.showIndex <= seeded);
}
