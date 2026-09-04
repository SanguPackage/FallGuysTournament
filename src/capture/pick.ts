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
  kept: Kept[];
  /**
   * How many frames were decoded and put to the classifier. Zero with candidates to spare means
   * none of them could be read, which is a different answer from "read them, none matched".
   */
  classified: number;
}

/**
 * Which of a moment's frames are worth keeping, earliest first. `identify` is pixel work only — the
 * expensive read happens later, and only on what survives here.
 */
export async function pick(
  candidates: Candidate[],
  want: Screen,
  limit: number,
  frameOf: (path: string) => Promise<Frame>,
  screenOf: (frame: Frame) => Screen | undefined = identify,
): Promise<Searched> {
  const kept: Kept[] = [];
  let classified = 0;
  for (const candidate of [...candidates].sort((a, b) => a.at - b.at)) {
    if (kept.length >= limit) break;
    try {
      const screen = screenOf(await frameOf(candidate.path));
      classified += 1;
      if (screen === want) kept.push(candidate);
    } catch {
      // A frame ffmpeg was still writing cannot be decoded. There are dozens more.
    }
  }
  return { kept, classified };
}
