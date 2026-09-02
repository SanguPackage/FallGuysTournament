/**
 * Every path in an argv here is already in Windows form — ffmpeg is a Windows process and cannot
 * see `/mnt/c`. The binary itself is the exception: Bun launches it, so it stays a WSL path.
 */
function win(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, "")}\\${name}`;
}

const QUIET = ["-hide_banner", "-loglevel", "error", "-y"];

export interface RecordOptions {
  ffmpeg: string;
  /** Which `ddagrab` desktop to grab. Monitors are numbered from 0. */
  output: number;
  /** A dshow audio device name, or nothing for a silent recording. */
  audioDevice?: string;
  dir: string;
  fps: number;
  segmentSeconds: number;
}

/**
 * `h264_qsv` because this machine's encode hardware is the Intel iGPU: `h264_nvenc` reports no
 * encode device and `h264_amf` fails outright. mkv because it survives the process being killed.
 */
export function recordArgv(o: RecordOptions): string[] {
  return [
    o.ffmpeg,
    ...QUIET,
    "-init_hw_device",
    "d3d11va",
    ...(o.audioDevice ? ["-f", "dshow", "-i", `audio=${o.audioDevice}`] : []),
    "-filter_complex",
    `ddagrab=output_idx=${o.output}:framerate=${o.fps},hwdownload,format=bgra`,
    "-c:v",
    "h264_qsv",
    "-g",
    String(o.fps),
    ...(o.audioDevice ? ["-c:a", "aac"] : []),
    "-f",
    "segment",
    "-segment_time",
    String(o.segmentSeconds),
    "-reset_timestamps",
    "1",
    "-segment_list",
    win(o.dir, "segments.csv"),
    "-segment_list_type",
    "csv",
    win(o.dir, "seg-%05d.mkv"),
  ];
}

export interface ExtractOptions {
  ffmpeg: string;
  segment: string;
  /** Seconds into the segment to start. */
  offset: number;
  duration: number;
  fps: number;
  /** An ffmpeg number pattern, e.g. `C:\scratch\f-%04d.jpg`. */
  pattern: string;
}

export function extractArgv(o: ExtractOptions): string[] {
  return [
    o.ffmpeg,
    ...QUIET,
    "-ss",
    String(o.offset),
    "-i",
    o.segment,
    "-t",
    String(o.duration),
    "-vf",
    `fps=${o.fps}`,
    "-q:v",
    "2",
    o.pattern,
  ];
}

/** The concat demuxer's list format. Paths are relative to the list file's own folder. */
export function concatList(files: string[]): string {
  return files.map((file) => `file '${file}'\n`).join("");
}

export interface CutOptions {
  ffmpeg: string;
  list: string;
  offset: number;
  duration: number;
  out: string;
}

export function cutArgv(o: CutOptions): string[] {
  return [
    o.ffmpeg,
    ...QUIET,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    o.list,
    "-ss",
    String(o.offset),
    "-t",
    String(o.duration),
    "-c",
    "copy",
    o.out,
  ];
}
