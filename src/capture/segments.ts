export interface Segment {
  /** Filename as the muxer wrote it, relative to the segment folder. */
  file: string;
  /** Epoch ms of the segment's first frame. */
  from: number;
  /** Epoch ms just past its last frame. */
  to: number;
}

/**
 * The segment muxer's `-segment_list_type csv`: `file,startSeconds,endSeconds` against the stream.
 * A row appears only once its segment closes, so the segment being recorded is never in here.
 */
export function parseSegments(csv: string, recordingStartedAt: number): Segment[] {
  const segments: Segment[] = [];
  for (const line of csv.split("\n")) {
    const [file, start, end] = line.trim().split(",");
    if (!file || start === undefined || end === undefined) continue;
    const from = Number(start);
    const to = Number(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    segments.push({
      file,
      from: recordingStartedAt + from * 1000,
      to: recordingStartedAt + to * 1000,
    });
  }
  return segments;
}

export interface Coverage {
  /** The segments the window falls across, in order. */
  parts: Segment[];
  /** Whether they hold the whole window. One running past the last closed segment does not. */
  complete: boolean;
}

export function coverage(segments: Segment[], from: number, to: number): Coverage {
  const parts = segments.filter((segment) => segment.from < to && segment.to > from);
  const first = parts[0];
  const last = parts.at(-1);
  const complete = first !== undefined && last !== undefined && first.from <= from && last.to >= to;
  return { parts, complete };
}

/** Seconds into a segment an instant falls, for ffmpeg's `-ss`. */
export function offsetIn(segment: Segment, at: number): number {
  return Math.max(0, (at - segment.from) / 1000);
}
