import { absoluteTimes } from "../screenshots";
import type { ParsedShow } from "../log";

export type MomentKind = "first" | "finalists" | "winner" | "field";

export interface Moment {
  kind: MomentKind;
  showIndex: number;
  /** The round the moment belongs to. Absent on a winner, which belongs to the show. */
  roundIndex?: number;
  /** The event day. Without it a later event reads as already captured. */
  date: string;
  /** Epoch ms the log stamped the moment. */
  at: number;
  /** Epoch ms of the first and last frame worth pulling. */
  from: number;
  to: number;
  /**
   * Only the toast is racing a screen that can live for a fraction of a second. The grid and the
   * winner screen stand for many seconds, so pulling them at full rate only costs decoding.
   */
  fps: number;
}

export interface ShowClip {
  showIndex: number;
  /** The event day. Without it a later event reads as already captured. */
  date: string;
  from: number;
  to: number;
}

/**
 * Milliseconds either side of the stamp, so a negative `from` starts before it.
 *
 * The board does not follow the last result promptly: the beans that went out have to finish
 * falling, and fireworks play over the ones left standing before the screen comes up at all. So the
 * window runs long and the classifier decides — a frame with no board in it is thrown away, which
 * makes waiting too long free and stopping too early fatal.
 *
 * `first` runs long for a different reason: the eliminated banner covers the top of the toast
 * column, so the trophy may not be readable until it clears. It stays at full rate throughout,
 * because the pill itself can live for a fraction of a second. That is 300 frames written to
 * scratch and deleted again; only the decoding stops early, once enough frames have been kept.
 */
const WINDOW: Record<MomentKind, { from: number; to: number; fps: number }> = {
  first: { from: -500, to: 10_000, fps: 30 },
  finalists: { from: 1000, to: 30_000, fps: 2 },
  winner: { from: 2000, to: 20_000, fps: 2 },
  field: { from: 2000, to: 20_000, fps: 5 },
};

/** How far past the last thing that happened a clip runs, so the screen that follows is in it. */
const CLIP_TAIL = 15_000;
/** How far before the first round a clip starts, so the level reveal is in it. */
const CLIP_HEAD = 5_000;

function moment(
  kind: MomentKind,
  showIndex: number,
  date: string,
  at: number,
  roundIndex?: number,
): Moment {
  const window = WINDOW[kind];
  return {
    kind,
    showIndex,
    ...(roundIndex === undefined ? {} : { roundIndex }),
    date,
    at,
    from: at + window.from,
    to: at + window.to,
    fps: window.fps,
  };
}

/** Every instant in the log worth pulling frames from, in the order they happened. */
export function momentsIn(shows: ParsedShow[], date: string): Moment[] {
  const times = absoluteTimes(shows, date);
  const moments: Moment[] = [];

  shows.forEach((show, showIndex) => {
    const span = times[showIndex]!;

    span.firsts.forEach((at, roundIndex) => {
      if (at !== undefined) moments.push(moment("first", showIndex, date, at, roundIndex));
    });

    // Round one is the only board that has the whole field on it, and only while it still reads
    // REMAIN — `pick` keeps earliest first, so the frames it takes are the ones with the fewest
    // cards flipped.
    //
    // Held back until the round after it has loaded: `ends[0]` is the last result *so far*, so
    // while round one is still being played it walks forward with every qualifier.
    const opened = show.rounds.length > 1 ? span.ends[0] : undefined;
    if (opened !== undefined) moments.push(moment("field", showIndex, date, opened, 0));

    // The board comes up after every round, so it only names finalists after the one before the
    // final. Same placement the capture panel uses.
    const before = show.rounds.length - 2;
    const boardAt = before >= 0 ? span.ends[before] : undefined;
    if (boardAt !== undefined) moments.push(moment("finalists", showIndex, date, boardAt, before));

    if (span.wonAt !== undefined) moments.push(moment("winner", showIndex, date, span.wonAt));
  });

  return moments.sort((a, b) => a.at - b.at);
}

/** One clip per show that has finished. A show still being played has no end to cut to. */
export function showClips(shows: ParsedShow[], date: string): ShowClip[] {
  const times = absoluteTimes(shows, date);
  const clips: ShowClip[] = [];

  shows.forEach((_show, showIndex) => {
    const span = times[showIndex]!;
    const from = span.rounds.find((start) => start !== undefined);
    if (from === undefined) return;

    const moved = times.slice(showIndex + 1).some((next) => next.startedAt !== undefined);
    const lastResult = [...span.ends].reverse().find((end) => end !== undefined);
    const end = span.wonAt ?? (moved ? lastResult : undefined);
    if (end === undefined) return;

    clips.push({ showIndex, date, from: from - CLIP_HEAD, to: end + CLIP_TAIL });
  });

  return clips;
}

/** What the ledger remembers a moment by, so a restart captures nothing twice. */
export function momentKey(moment: Moment): string {
  return `${moment.date}:${moment.showIndex}:${moment.kind}:${moment.roundIndex ?? "-"}`;
}

export function clipKey(clip: ShowClip): string {
  return `${clip.date}:${clip.showIndex}:clip`;
}
