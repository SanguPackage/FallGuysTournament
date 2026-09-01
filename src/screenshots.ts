import type { ParsedShow } from "./log";

export interface Shot {
  /** Path relative to the screenshot root, which is all the admin page ever learns. */
  file: string;
  takenAt: number;
}

export type Selection =
  | { slot: "round"; roundIndex: number }
  | { slot: "finalists" }
  | { slot: "winners" }
  | { slot: "show" }
  | { slot: "all" }
  | { slot: "unmatched" };

export interface PlacedShot extends Shot {
  /** Absent when the capture falls outside every show the log knows about. */
  showIndex?: number;
  slot?: Selection["slot"];
  roundIndex?: number;
}

interface Window {
  from: number;
  to: number;
  showIndex: number;
  slot: Selection["slot"];
  roundIndex?: number;
}

export interface ShowTimes {
  startedAt?: number;
  wonAt?: number;
  rounds: (number | undefined)[];
}

/**
 * The log writes a UTC clock time with no date, so a session played past midnight reads as going
 * backwards. Stamps arrive in order, so a step backwards is a new day.
 */
function clockReader(date: string) {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  let day = 0;
  let previous = -1;

  return (clock: string | undefined): number | undefined => {
    if (clock === undefined) return undefined;
    const [hours, minutes, seconds] = clock.split(":").map(Number) as [number, number, number];
    const ms = ((hours * 60 + minutes) * 60 + seconds) * 1000;
    if (ms < previous) day += 1;
    previous = ms;
    return midnight + day * 86_400_000 + ms;
  };
}

/** When each show and round actually happened, so the admin can show one clock throughout. */
export function absoluteTimes(shows: ParsedShow[], date: string): ShowTimes[] {
  const read = clockReader(date);
  return shows.map((show) => ({
    startedAt: read(show.startedAt),
    rounds: show.rounds.map((round) => read(round.startedAt)),
    wonAt: read(show.wonAt),
  }));
}

function windowsFor(shows: ParsedShow[], date: string): Window[] {
  const spans = absoluteTimes(shows, date).map((times, index) => ({
    show: shows[index]!,
    ...times,
  }));

  const windows: Window[] = [];

  spans.forEach((span, showIndex) => {
    if (span.startedAt === undefined) return;
    const ends = spans.slice(showIndex + 1).find((next) => next.startedAt !== undefined);
    const showEnd = ends?.startedAt ?? Infinity;

    windows.push({ from: span.startedAt, to: showEnd, showIndex, slot: "show" });

    span.rounds.forEach((from, roundIndex) => {
      if (from === undefined) return;
      const isFinal = span.show.rounds[roundIndex]!.isFinal;
      const next = span.rounds.slice(roundIndex + 1).find((start) => start !== undefined);
      const to = next ?? span.wonAt ?? showEnd;
      windows.push({
        from,
        to,
        showIndex,
        ...(isFinal ? { slot: "finalists" as const } : { slot: "round" as const, roundIndex }),
      });
    });

    if (span.wonAt !== undefined) {
      windows.push({ from: span.wonAt, to: showEnd, showIndex, slot: "winners" });
    }
  });

  return windows;
}

export function placeShots(shots: Shot[], shows: ParsedShow[], date: string): PlacedShot[] {
  const windows = windowsFor(shows, date);
  const holds = (window: Window, shot: Shot) =>
    shot.takenAt >= window.from && shot.takenAt < window.to;

  return [...shots]
    .sort((a, b) => a.takenAt - b.takenAt)
    .map((shot) => {
      const window =
        windows.find((candidate) => candidate.slot !== "show" && holds(candidate, shot)) ??
        windows.find((candidate) => candidate.slot === "show" && holds(candidate, shot));
      if (!window) return { ...shot };
      const { showIndex, slot, roundIndex } = window;
      return { ...shot, showIndex, slot, ...(roundIndex === undefined ? {} : { roundIndex }) };
    });
}

export function shotsForSlot(
  shots: PlacedShot[],
  showIndex: number,
  selection: Selection,
): PlacedShot[] {
  if (selection.slot === "unmatched") return shots.filter((shot) => shot.showIndex === undefined);
  if (selection.slot === "all") return shots.filter((shot) => shot.showIndex === showIndex);

  // The victory screen comes up seconds after the final ends, and it is still about the final.
  if (selection.slot === "finalists") {
    return shots.filter(
      (shot) =>
        shot.showIndex === showIndex && (shot.slot === "finalists" || shot.slot === "winners"),
    );
  }

  return shots.filter(
    (shot) =>
      shot.showIndex === showIndex &&
      shot.slot === selection.slot &&
      (selection.slot !== "round" || shot.roundIndex === selection.roundIndex),
  );
}
