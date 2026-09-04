import type { PlacedShot } from "../screenshots";
import type { Player } from "../types";
import type { ShotRead } from "./read";

/**
 * The roster a test run should adopt, or `undefined` to leave the file alone. Nobody registered is
 * the whole condition: on game day the roster is typed in, so this never comes true.
 */
export function seededRoster(
  players: Player[],
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
): Player[] | undefined {
  const registered = players.some((player) => !player.admin && player.ingame);
  if (registered) return undefined;

  const boards = shots.filter(
    (shot) =>
      shot.showIndex === 0 &&
      shot.roundIndex === 0 &&
      reads[shot.file]?.screen === "grid" &&
      (reads[shot.file]?.tokens.length ?? 0) > 0,
  );
  // A capture caught before the plate settles has fewer cards green than one caught after it.
  const board = boards.sort(
    (a, b) => reads[b.file]!.tokens.length - reads[a.file]!.tokens.length || b.takenAt - a.takenAt,
  )[0];
  if (!board) return undefined;

  const known = new Set(players.map((player) => player.ingame));
  const fresh: Player[] = [];
  for (const ingame of reads[board.file]!.tokens) {
    if (known.has(ingame)) continue;
    known.add(ingame);
    fresh.push({ ingame });
  }
  return fresh.length === 0 ? undefined : [...players, ...fresh];
}
