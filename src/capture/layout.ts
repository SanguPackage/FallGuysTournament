import type { MomentKind } from "./moments";

/** What each moment is called in a file name. The code's own words are too terse to browse by. */
const KIND: Record<MomentKind, string> = {
  first: "first-race-finisher",
  finalists: "finalists-board",
  field: "whole-field",
  winner: "winner",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Rounds are numbered from 1 here, as the admin and the board show them. */
export function captureFile(kind: MomentKind, roundNumber: number, index: number): string {
  return `round-${pad(roundNumber)}-${KIND[kind]}-${pad(index)}.jpg`;
}
