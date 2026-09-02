import { mkdir, readdir, rm, utimes } from "node:fs/promises";
import { concatList, cutArgv, extractArgv } from "./command";
import { clipKey, momentKey, type Moment, type MomentKind, type ShowClip } from "./moments";
import { pick } from "./pick";
import { coverage, offsetIn, type Segment } from "./segments";
import { toWindows } from "./win-path";
import type { Ledger } from "./ledger";
import type { Frame } from "../ocr/frame";
import type { Screen } from "../ocr/recognizers";

/** Which screen each moment is hunting for. */
const WANTED: Record<MomentKind, Screen> = {
  first: "toast",
  finalists: "grid",
  winner: "winner",
};

/** More than this and the capture panel is a wall of near-identical frames. */
const KEEP = 5;

export interface RunResult {
  ok: boolean;
  stderr: string;
}

export interface CaptureDeps {
  ffmpeg: string;
  segmentDir: string;
  scratchDir: string;
  captureDir: string;
  run: (argv: string[]) => Promise<RunResult>;
  frameOf: (path: string) => Promise<Frame>;
  screenOf: (frame: Frame) => Screen | undefined;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** `YYYY-MM`, the month folder both shots roots are laid out by. */
function monthOf(at: number): string {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1, 2)}`;
}

/** `HHMMSS` of the instant, so a frame's name says when it is from. */
function clockOf(at: number): string {
  const date = new Date(at);
  return `${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}`;
}

/**
 * Pulls one moment's frames, keeps the few showing the screen it wanted, and files them under the
 * mtime of the instant each shows — which is what lets `placeShots` treat them as captures.
 *
 * Returns the paths kept, relative to the capture root. An empty return leaves the moment pending:
 * the segment holding it may simply not have closed yet.
 */
export async function captureMoment(
  moment: Moment,
  segments: Segment[],
  ledger: Ledger,
  deps: CaptureDeps,
): Promise<string[]> {
  const key = momentKey(moment);
  const { parts, complete } = coverage(segments, moment.from, moment.to);
  if (!complete) {
    ledger.failed(key);
    return [];
  }

  const scratch = `${deps.scratchDir}/${key.replace(/:/g, "-")}`;
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });

  try {
    const candidates: { path: string; at: number }[] = [];

    for (const [index, part] of parts.entries()) {
      const from = Math.max(moment.from, part.from);
      const to = Math.min(moment.to, part.to);
      const result = await deps.run(
        extractArgv({
          ffmpeg: deps.ffmpeg,
          segment: toWindows(`${deps.segmentDir}/${part.file}`),
          offset: offsetIn(part, from),
          duration: (to - from) / 1000,
          fps: moment.fps,
          pattern: toWindows(`${scratch}/p${index}-%04d.jpg`),
        }),
      );
      if (!result.ok) continue;

      const names = (await readdir(scratch)).filter((name) => name.startsWith(`p${index}-`)).sort();
      names.forEach((name, frame) => {
        // ffmpeg numbers from 1, and each frame is one tick of the requested rate past the seek.
        candidates.push({ path: `${scratch}/${name}`, at: from + (frame * 1000) / moment.fps });
      });
    }

    const kept: string[] = [];
    const chosen = await pick(candidates, WANTED[moment.kind], KEEP, deps.frameOf, deps.screenOf);

    for (const candidate of chosen) {
      const month = monthOf(candidate.at);
      const name = `auto-${moment.showIndex + 1}-${moment.kind}-${clockOf(candidate.at)}-${kept.length + 1}.jpg`;
      const relative = `${month}/${name}`;
      await mkdir(`${deps.captureDir}/${month}`, { recursive: true });
      await Bun.write(`${deps.captureDir}/${relative}`, Bun.file(candidate.path));
      const seconds = candidate.at / 1000;
      await utimes(`${deps.captureDir}/${relative}`, seconds, seconds);
      kept.push(relative);
    }

    if (kept.length === 0) ledger.failed(key);
    else ledger.done(key);
    return kept;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export interface ClipDeps {
  ffmpeg: string;
  segmentDir: string;
  showsDir: string;
  run: (argv: string[]) => Promise<RunResult>;
}

/**
 * Cuts one show's mp4 out of the segments it spans. `-c copy`, so this is a file operation rather
 * than an encode; `-g` on the recording is what keeps the cut within about a second of `from`.
 */
export async function cutShowClip(
  clip: ShowClip,
  segments: Segment[],
  name: string,
  ledger: Ledger,
  deps: ClipDeps,
): Promise<string | undefined> {
  const key = clipKey(clip);
  const { parts, complete } = coverage(segments, clip.from, clip.to);
  if (!complete) {
    ledger.failed(key);
    return undefined;
  }

  const list = `${deps.segmentDir}/clip-${clip.showIndex}.txt`;
  await Bun.write(list, concatList(parts.map((part) => part.file)));
  await mkdir(deps.showsDir, { recursive: true });

  const out = `${deps.showsDir}/${name}.mp4`;
  const result = await deps.run(
    cutArgv({
      ffmpeg: deps.ffmpeg,
      list: toWindows(list),
      offset: offsetIn(parts[0]!, clip.from),
      duration: (clip.to - clip.from) / 1000,
      out: toWindows(out),
    }),
  );

  if (!result.ok) {
    ledger.failed(key);
    return undefined;
  }
  ledger.done(key);
  return out;
}
