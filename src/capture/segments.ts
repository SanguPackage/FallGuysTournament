export interface Segment {
  /** Filename as the muxer wrote it, relative to `dir`. */
  file: string;
  /** The run folder holding it. Each ffmpeg spawn numbers from zero into its own. */
  dir: string;
  /** Epoch ms of the segment's first frame. */
  from: number;
  /** Epoch ms just past its last frame. */
  to: number;
}

/**
 * The segment muxer's `-segment_list_type csv`: `file,startSeconds,endSeconds` against the stream.
 * A row appears only once its segment closes, so the segment being recorded is never in here.
 */
export function parseSegments(csv: string, recordingStartedAt: number, dir: string): Segment[] {
  const segments: Segment[] = [];
  for (const line of csv.split("\n")) {
    const [file, start, end] = line.trim().split(",");
    if (!file || start === undefined || end === undefined) continue;
    const from = Number(start);
    const to = Number(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    segments.push({
      file,
      dir,
      from: recordingStartedAt + from * 1000,
      to: recordingStartedAt + to * 1000,
    });
  }
  return segments;
}

/**
 * Inside a run one row's end is the next row's start, so anything above this is a run boundary:
 * the dead run's last segment was never closed, and the respawn took time on top of that.
 */
const GAP_MS = 1000;

export interface Coverage {
  /** The segments the window falls across, in order. */
  parts: Segment[];
  /** Whether they hold the whole window. One running past the last closed segment does not. */
  complete: boolean;
  /** Whether a recording died mid-window, leaving a hole between two parts. */
  gapped: boolean;
}

export function coverage(segments: Segment[], from: number, to: number): Coverage {
  const parts = segments
    .filter((segment) => segment.from < to && segment.to > from)
    .sort((a, b) => a.from - b.from);
  const first = parts[0];
  const last = parts.at(-1);
  const complete = first !== undefined && last !== undefined && first.from <= from && last.to >= to;
  const gapped = parts.some((part, index) => index > 0 && part.from - parts[index - 1]!.to > GAP_MS);
  return { parts, complete, gapped };
}

/** Seconds into a segment an instant falls, for ffmpeg's `-ss`. */
export function offsetIn(segment: Segment, at: number): number {
  return Math.max(0, (at - segment.from) / 1000);
}
