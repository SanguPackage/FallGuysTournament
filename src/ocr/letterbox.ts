import type { Frame } from "./frame";

/** Compression leaves a bar a few levels off black rather than at zero. */
const BLACK = 16;
/** Columns and rows sampled across an edge. Enough that a dark screen keeps one lit pixel. */
const SAMPLES = 64;
/** Past this the picture, not a bar, is what is being cut. */
const MOST = 0.3;

function isBlack(frame: Frame, along: "row" | "column", at: number): boolean {
  const span = along === "row" ? frame.width : frame.height;
  const step = Math.max(1, Math.floor(span / SAMPLES));
  for (let i = 0; i < span; i += step) {
    const [r, g, b] = along === "row" ? frame.at(i, at) : frame.at(at, i);
    if (Math.max(r, g, b) > BLACK) return false;
  }
  return true;
}

/** How many black rows or columns run in from one edge. One that runs past `MOST` is not a bar. */
function barAt(frame: Frame, along: "row" | "column", from: number, step: number): number {
  const size = along === "row" ? frame.height : frame.width;
  const limit = Math.floor(size * MOST);
  let bar = 0;
  while (bar < limit && isBlack(frame, along, from + bar * step)) bar += 1;
  return bar === limit ? 0 : bar;
}

/**
 * The picture inside the black bars a screen of a different shape leaves around it — a 16:9 game on
 * a 16:10 monitor, say. Every measurement the recognizers take is a share of the frame, so a frame
 * carrying bars puts all of them out by the thickness of the bar.
 *
 * A frame with nothing to take, and one dark enough that the picture itself reads as a bar, come
 * back untouched.
 */
export function cropBars(frame: Frame): Frame {
  const top = barAt(frame, "row", 0, 1);
  const bottom = barAt(frame, "row", frame.height - 1, -1);
  const left = barAt(frame, "column", 0, 1);
  const right = barAt(frame, "column", frame.width - 1, -1);

  const width = frame.width - left - right;
  const height = frame.height - top - bottom;
  if (width === frame.width && height === frame.height) return frame;

  return {
    width,
    height,
    at(x, y) {
      const cx = Math.min(Math.max(x, 0), width - 1);
      const cy = Math.min(Math.max(y, 0), height - 1);
      return frame.at(left + cx, top + cy);
    },
  };
}
