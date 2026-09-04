import { mkdir, readdir, rm, utimes } from "node:fs/promises";
import { dirname } from "node:path";
import { CLASSIFY_HEIGHT, concatList, cutArgv, extractArgv } from "./command";
import { captureFile } from "./layout";
import { clipKey, momentKey, type Moment, type MomentKind, type ShowClip } from "./moments";
import { pick, type Candidate } from "./pick";
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
  field: "field",
};

/** More than this and the capture panel is a wall of near-identical frames. */
const KEEP = 5;

export interface RunResult {
  ok: boolean;
  stderr: string;
}

export interface CaptureDeps {
  ffmpeg: string;
  scratchDir: string;
  showsDir: string;
  run: (argv: string[]) => Promise<RunResult>;
  frameOf: (path: string) => Promise<Frame>;
  screenOf: (frame: Frame) => Screen | undefined;
  now: () => number;
}

/**
 * How long after a moment's window the footage holding it is certainly on disk: a segment is only
 * listed once it closes, which is up to its own length after the frames went into it.
 */
const SETTLE_MS = 90_000;

/**
 * The full-size frames behind what the search settled on. The search reads a scaled copy — decoding
 * 4K is most of what a pass costs — so what it kept has to be pulled again at full size.
 *
 * Pulled as one span per segment rather than a seek each: opening a 4K segment costs far more than
 * the handful of extra frames between the first kept instant and the last.
 *
 * A frame that will not come out leaves the scaled one in its place. A smaller picture of the
 * moment is worth more than none, and the winner screen and the toast cannot be re-shot.
 */
async function fullFrames(
  chosen: Candidate[],
  scratch: string,
  fps: number,
  deps: CaptureDeps,
): Promise<string[]> {
  const full = new Map<number, string>();
  const parts = new Map<string, Candidate[]>();
  for (const candidate of chosen) {
    if (!candidate.part) continue;
    const key = `${candidate.part.dir}/${candidate.part.file}`;
    parts.set(key, [...(parts.get(key) ?? []), candidate]);
  }

  let group = 0;
  for (const [segment, members] of parts) {
    const part = members[0]!.part!;
    const from = Math.min(...members.map((one) => one.at));
    const to = Math.max(...members.map((one) => one.at));
    const prefix = `keep-${group++}`;
    const result = await deps.run(
      extractArgv({
        ffmpeg: deps.ffmpeg,
        segment: toWindows(segment),
        offset: offsetIn(part, from),
        // A span of one frame still has to ask for one frame's worth of time.
        duration: (to - from) / 1000 + 1 / fps,
        fps,
        pattern: toWindows(`${scratch}/${prefix}-%04d.jpg`),
      }),
    );
    if (!result.ok) continue;

    const names = (await readdir(scratch)).filter((name) => name.startsWith(`${prefix}-`)).sort();
    for (const candidate of members) {
      const name = names[Math.round(((candidate.at - from) * fps) / 1000)];
      if (name !== undefined) full.set(candidate.at, `${scratch}/${name}`);
    }
  }

  return chosen.map((candidate) => full.get(candidate.at) ?? candidate.path);
}

/**
 * Pulls one moment's frames, keeps the few showing the screen it wanted, and files them under the
 * mtime of the instant each shows — which is what lets `placeShots` treat them as captures.
 *
 * `showDir` is the show's folder name, relative to `showsDir`.
 *
 * Returns the paths kept, relative to `showsDir`. An empty return leaves the moment pending: the
 * segment holding it may simply not have closed yet.
 */
export async function captureMoment(
  moment: Moment,
  showDir: string,
  segments: Segment[],
  ledger: Ledger,
  deps: CaptureDeps,
): Promise<string[]> {
  const key = momentKey(moment);
  const { parts, complete } = coverage(segments, moment.from, moment.to);
  if (!complete) {
    // Waiting on a segment still being written is the normal case for the first half-minute, and
    // spending an attempt on it abandons the moment before the footage holding it exists.
    if (deps.now() > moment.to + SETTLE_MS) ledger.failed(key);
    return [];
  }

  const scratch = `${deps.scratchDir}/${key.replace(/:/g, "-")}`;
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await mkdir(`${deps.showsDir}/${showDir}`, { recursive: true });

  try {
    const candidates: Candidate[] = [];

    for (const [index, part] of parts.entries()) {
      const from = Math.max(moment.from, part.from);
      const to = Math.min(moment.to, part.to);
      const result = await deps.run(
        extractArgv({
          ffmpeg: deps.ffmpeg,
          segment: toWindows(`${part.dir}/${part.file}`),
          offset: offsetIn(part, from),
          duration: (to - from) / 1000,
          fps: moment.fps,
          pattern: toWindows(`${scratch}/p${index}-%04d.jpg`),
          height: CLASSIFY_HEIGHT,
        }),
      );
      if (!result.ok) continue;

      const names = (await readdir(scratch)).filter((name) => name.startsWith(`p${index}-`)).sort();
      names.forEach((name, frame) => {
        // ffmpeg numbers from 1, and each frame is one tick of the requested rate past the seek.
        candidates.push({ path: `${scratch}/${name}`, part, at: from + (frame * 1000) / moment.fps });
      });
    }

    const kept: string[] = [];
    const { kept: chosen, classified } = await pick(
      candidates,
      WANTED[moment.kind],
      KEEP,
      deps.frameOf,
      deps.screenOf,
    );

    const fulls = await fullFrames(chosen, scratch, moment.fps, deps);

    for (const [index, candidate] of chosen.entries()) {
      const relative = `${showDir}/${captureFile(moment.kind, moment.roundNumber, kept.length + 1)}`;
      await Bun.write(`${deps.showsDir}/${relative}`, Bun.file(fulls[index]!));
      const seconds = candidate.at / 1000;
      await utimes(`${deps.showsDir}/${relative}`, seconds, seconds);
      kept.push(relative);
    }

    // A pass that read frames and found none of what it wanted has its answer: the screen is not in
    // this footage, and re-reading the same frames cannot change that. Only a pass that got no
    // frames to read — extraction failed, or they were still being written — is worth another go.
    if (kept.length > 0) ledger.done(key);
    else if (classified > 0) ledger.exhausted(key);
    else ledger.failed(key);
    return kept;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export interface ClipDeps {
  ffmpeg: string;
  scratchDir: string;
  showsDir: string;
  run: (argv: string[]) => Promise<RunResult>;
}

export interface ClipResult {
  out: string;
  /** The clip jumps here: a recording died inside the window and the parts do not meet. */
  gapped: boolean;
}

/**
 * Cuts one show's mp4 out of the segments it spans. `-c copy`, so this is a file operation rather
 * than an encode; `-g` on the recording is what keeps the cut within about a second of `from`.
 *
 * `file` is the clip's whole path relative to `showsDir`, without the `.mp4` extension.
 *
 * A window with a hole in it is still cut. Refusing would spend the ledger's attempts and abandon
 * a show whose footage is on disk, and a clip that jumps is worth more than no clip.
 */
export async function cutShowClip(
  clip: ShowClip,
  file: string,
  segments: Segment[],
  ledger: Ledger,
  deps: ClipDeps,
): Promise<ClipResult | undefined> {
  const key = clipKey(clip);
  const { parts, complete, gapped } = coverage(segments, clip.from, clip.to);
  if (!complete) {
    ledger.failed(key);
    return undefined;
  }

  const list = `${deps.scratchDir}/clip-${clip.showIndex}.txt`;
  await mkdir(deps.scratchDir, { recursive: true });
  await Bun.write(list, concatList(parts.map((part) => toWindows(`${part.dir}/${part.file}`))));

  const out = `${deps.showsDir}/${file}.mp4`;
  await mkdir(dirname(out), { recursive: true });

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
  return { out, gapped };
}
