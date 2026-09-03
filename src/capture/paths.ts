import type { Run } from "./recorder";

/** ShareX ships the ffmpeg the screen recorder uses, so there is nothing to install. */
export const FFMPEG_DEFAULT = "/mnt/c/Program Files/ShareX/ffmpeg.exe";
/** Not the repo: it is inside Dropbox, and this is tens of gigabytes. */
export const CAPTURE_DIR_DEFAULT = "/mnt/c/temp/FallGuysCapture";
/** What the screen-capture-recorder installer registers. Taps the default output, changing nothing. */
export const AUDIO_DEFAULT = "virtual-audio-capturer";

export interface CaptureSettings {
  /** Absent when no ffmpeg was found, which is the only fatal one. */
  ffmpeg?: string;
  dir: string;
  output: number;
  /** Absent means record silently. */
  audioDevice?: string;
}

export type Exists = (path: string) => Promise<boolean>;

const fileExists: Exists = (path) => Bun.file(path).exists();

/** Everything here is in WSL form; `toWindows` is applied where an ffmpeg argv is built. */
export async function captureSettings(
  env: Record<string, string | undefined>,
  exists: Exists = fileExists,
): Promise<CaptureSettings> {
  const wanted = [env.FFMPEG_PATH, FFMPEG_DEFAULT].filter((path): path is string => !!path);
  let ffmpeg: string | undefined;
  for (const path of wanted) {
    if (await exists(path)) {
      ffmpeg = path;
      break;
    }
  }

  const output = Number(env.CAPTURE_OUTPUT);
  const audio = env.CAPTURE_AUDIO ?? AUDIO_DEFAULT;

  return {
    ...(ffmpeg === undefined ? {} : { ffmpeg }),
    dir: env.CAPTURE_DIR ?? CAPTURE_DIR_DEFAULT,
    output: Number.isInteger(output) ? output : 0,
    ...(audio === "off" ? {} : { audioDevice: audio }),
  };
}

/** The folders under the capture dir, so nothing has to spell them out twice. */
export function captureFolders(dir: string) {
  const at = (name: string) => `${dir.replace(/\/+$/, "")}/${name}`;
  return {
    segments: at("segments"),
    shows: at("shows"),
    scratch: at("scratch"),
  };
}

/**
 * One spawn's folder. Local time, because the event is a local evening. Seconds are in it because
 * ffmpeg can die and be respawned inside the same minute, and two spawns sharing a folder is the
 * overwrite this whole layout exists to prevent.
 */
export function runFolder(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}h${pad(date.getMinutes())}m${pad(date.getSeconds())}`;
  return `${day}T${clock}`;
}

/**
 * The clock a run folder was named for, or nothing if the name is not one.
 *
 * Only good to the second, which the name is all that survives of. A recorder still holding the
 * spawn knows it to the millisecond, so `runsIn` prefers that where it has it.
 */
export function runStartedAt(name: string): number | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})h(\d{2})m(\d{2})(?:-\d+)?$/.exec(name);
  if (!parts) return undefined;
  const [year, month, day, hours, minutes, seconds] = parts.slice(1).map(Number) as number[];
  return new Date(year!, month! - 1, day!, hours!, minutes!, seconds!).getTime();
}

/**
 * Every run whose segments are on disk, not only the ones this process spawned. A restart mid-event
 * otherwise loses sight of everything recorded before it, and the moments inside that footage spend
 * their attempts waiting for coverage that is already there.
 */
export function runsIn(dir: string, names: string[], spawned: Run[]): Run[] {
  const runs = new Map<string, number>();
  for (const name of names) {
    const startedAt = runStartedAt(name);
    if (startedAt !== undefined) runs.set(`${dir}/${name}`, startedAt);
  }
  for (const run of spawned) runs.set(run.dir, run.startedAt);
  return [...runs].map(([runDir, startedAt]) => ({ dir: runDir, startedAt }));
}
