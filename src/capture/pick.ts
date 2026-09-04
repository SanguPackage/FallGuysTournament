import { identify, type Screen } from "../ocr/recognizers";
import type { Frame } from "../ocr/frame";
import type { Segment } from "./segments";

export interface Candidate {
  /** The frame to read, which is the scaled copy where the search made one. */
  path: string;
  /** The segment it was pulled from, so the full-size frame can be fetched if it is kept. */
  part?: Segment;
  /** Epoch ms the frame shows. */
  at: number;
}

export type Kept = Candidate;

export interface Searched {
  /** The frames kept for each screen asked for, earliest first. */
  kept: Map<Screen, Kept[]>;
  /**
   * How many frames were decoded and put to the classifier. Zero with candidates to spare means
   * none of them could be read, which is a different answer from "read them, none matched".
   */
  classified: number;
}

/**
 * Which of a moment's frames are worth keeping, earliest first. `identify` is pixel work only — the
 * expensive read happens later, and only on what survives here.
 *
 * `wanted` is how many more of each screen to take. Decoding is what a pass costs, so a frame is
 * read once and offered to every screen still short of its fill — the round-one board is the whole
 * field before it settles and the qualifiers after, and one read of it answers both. A count of
 * zero keeps a screen's place without taking more, so a caller working through the footage a
 * segment at a time can carry on where the last one stopped.
 */
export async function pick(
  candidates: Candidate[],
  wanted: Map<Screen, number>,
  frameOf: (path: string) => Promise<Frame>,
  screenOf: (frame: Frame) => Screen | undefined = identify,
): Promise<Searched> {
  const kept = new Map<Screen, Kept[]>([...wanted.keys()].map((screen) => [screen, []]));
  const short = new Map(wanted);
  let classified = 0;
  for (const candidate of [...candidates].sort((a, b) => a.at - b.at)) {
    if ([...short.values()].every((count) => count <= 0)) break;
    try {
      const screen = screenOf(await frameOf(candidate.path));
      classified += 1;
      if (screen === undefined) continue;
      const room = short.get(screen);
      if (room === undefined || room <= 0) continue;
      kept.get(screen)!.push(candidate);
      short.set(screen, room - 1);
    } catch {
      // A frame ffmpeg was still writing cannot be decoded. There are dozens more.
    }
  }
  return { kept, classified };
}
