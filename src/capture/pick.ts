import { identify, type Screen } from "../ocr/recognizers";
import type { Frame } from "../ocr/frame";

export interface Candidate {
  path: string;
  /** Epoch ms the frame shows. */
  at: number;
}

export type Kept = Candidate;

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
): Promise<Kept[]> {
  const kept: Kept[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.at - b.at)) {
    if (kept.length >= limit) break;
    try {
      if (screenOf(await frameOf(candidate.path)) === want) kept.push(candidate);
    } catch {
      // A frame ffmpeg was still writing cannot be decoded. There are dozens more.
    }
  }
  return kept;
}
