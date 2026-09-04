import type { PlacedShot } from "../screenshots";
import type { Player } from "../types";
import type { ShotRead } from "./read";

/**
 * Whether anybody is signed up to play. Admins run the event rather than competing, and a row with
 * no name is one still being typed in, so neither counts as a roster.
 */
export function anyoneRegistered(players: Player[]): boolean {
  return players.some((player) => !player.admin && player.ingame);
}

/**
 * The roster a test run should adopt, or `undefined` to leave the file alone. Nobody registered is
 * the whole condition: on game day the roster is typed in, so this never comes true.
 */
export function seededRoster(
  players: Player[],
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
): Player[] | undefined {
  if (anyoneRegistered(players)) return undefined;

  const boards = shots.flatMap((shot) => {
    const read = reads[shot.file];
    const first = shot.showIndex === 0 && shot.roundIndex === 0;
    return first && read?.screen === "grid" && read.tokens.length > 0 ? [{ shot, read }] : [];
  });
  // A capture caught before the plate settles has fewer cards green than one caught after it.
  const board = boards.sort(
    (a, b) => b.read.tokens.length - a.read.tokens.length || b.shot.takenAt - a.shot.takenAt,
  )[0];
  if (!board) return undefined;

  const known = new Set(players.map((player) => player.ingame));
  const fresh: Player[] = [];
  for (const ingame of board.read.tokens) {
    if (known.has(ingame)) continue;
    known.add(ingame);
    fresh.push({ ingame });
  }
  return fresh.length === 0 ? undefined : [...players, ...fresh];
}
