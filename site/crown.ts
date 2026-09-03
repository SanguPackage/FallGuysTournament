import sangu from "../data/sangu.json";

/** Cumulative crowns to reach each level, level 1 first. */
const CROWNS: number[] = sangu.crownLevels;

/**
 * What the crown level beside a name is worth: the crowns it takes to reach it, up to the last
 * before the next level. The top level is open-ended.
 */
export function crownTitle(level: number): string | undefined {
  if (!Number.isInteger(level) || level < 1 || level > CROWNS.length) return undefined;

  const from = CROWNS[level - 1]!;
  const next = CROWNS[level];
  if (next === undefined) return `Crown level ${level} · ${from}+ crowns`;

  const span = next - from === 1 ? `${from}` : `${from}–${next - 1}`;
  return `Crown level ${level} · ${span} crown${span === "1" ? "" : "s"}`;
}
