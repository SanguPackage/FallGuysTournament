import type { ParsedShow } from "./log";

/** Which folder a capture came out of: ShareX's, or the frames cut from the recording. */
export type ShotSource = "sharex" | "auto";

export interface Shot {
  /** Path relative to the screenshot root, which is all the admin page ever learns. */
  file: string;
  takenAt: number;
  source: ShotSource;
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
  /**
   * The screen naming who got through comes up once the round before the final has ended, and it
   * is the only place the finalists' names are written down.
   */
  namesFinalists?: true;
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
  /** When each round's first qualifier came in, which is when the trophy pill appeared. */
  firsts: (number | undefined)[];
  /** When each round's last result came in, so the screen that follows it can be told apart. */
  ends: (number | undefined)[];
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
  // The reader rolls the day over whenever the clock steps back, so stamps must reach it in order.
  return shows.map((show) => {
    const startedAt = read(show.startedAt);
    const rounds: (number | undefined)[] = [];
    const firsts: (number | undefined)[] = [];
    const ends: (number | undefined)[] = [];
    for (const round of show.rounds) {
      rounds.push(read(round.startedAt));
      firsts.push(read(round.firstQualifiedAt));
      ends.push(read(round.endedAt));
    }
    return { startedAt, rounds, firsts, ends, wonAt: read(show.wonAt) };
  });
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
  const times = absoluteTimes(shows, date);
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
      const placed: PlacedShot = {
        ...shot,
        showIndex,
        slot,
        ...(roundIndex === undefined ? {} : { roundIndex }),
      };

      const rounds = shows[showIndex]!.rounds;
      const ended = roundIndex === undefined ? undefined : times[showIndex]!.ends[roundIndex];
      if (
        roundIndex === rounds.length - 2 &&
        rounds.at(-1)?.isFinal === true &&
        ended !== undefined &&
        shot.takenAt >= ended
      ) {
        placed.namesFinalists = true;
      }

      return placed;
    });
}

export function shotsForSlot(
  shots: PlacedShot[],
  showIndex: number,
  selection: Selection,
): PlacedShot[] {
  if (selection.slot === "unmatched") return shots.filter((shot) => shot.showIndex === undefined);
  if (selection.slot === "all") return shots.filter((shot) => shot.showIndex === showIndex);

  // The final is bracketed by the two screens that name people: who got through, and who won.
  if (selection.slot === "finalists") {
    return shots.filter(
      (shot) =>
        shot.showIndex === showIndex &&
        (shot.slot === "finalists" || shot.slot === "winners" || shot.namesFinalists === true),
    );
  }

  return shots.filter(
    (shot) =>
      shot.showIndex === showIndex &&
      shot.slot === selection.slot &&
      (selection.slot !== "round" || shot.roundIndex === selection.roundIndex),
  );
}
