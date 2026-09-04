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
  const board = shots.find(
    (shot) =>
      shot.showIndex === 0 &&
      shot.roundIndex === 0 &&
      reads[shot.file]?.screen === "grid" &&
      (reads[shot.file]?.tokens.length ?? 0) > 0,
  );
  if (!board) return undefined;

  return [...players, ...reads[board.file]!.tokens.map((ingame) => ({ ingame }))];
}
