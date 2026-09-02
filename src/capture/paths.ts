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

/** The four folders under the capture dir, so nothing has to spell them out twice. */
export function captureFolders(dir: string) {
  const at = (name: string) => `${dir.replace(/\/+$/, "")}/${name}`;
  return {
    segments: at("segments"),
    shows: at("shows"),
    scratch: at("scratch"),
    captures: at("captures"),
  };
}
