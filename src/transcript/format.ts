/** How wide a transcript line is drawn. Rules are padded to it; entries only reach it via a mark. */
export const WIDTH = 84;

export type Lane = "log" | "clip" | "shots" | "shot" | "ocr" | "fill" | "queue" | "admin";

export type MarkKind = "ok" | "fuzzy" | "warn" | "fail";

export interface Mark {
  kind: MarkKind;
  text?: string;
}

export type Line =
  | { kind: "entry"; at: number; lane: Lane; text: string; mark?: Mark; star?: boolean }
  | { kind: "show"; at: number; number: number; name: string; note: string }
  | { kind: "round"; at: number; number: number; map: string; type: string }
  | { kind: "closed"; at: number; number: number; note: string }
  | { kind: "note"; text: string };

const LANE_WIDTH = 6;
const GAP = "  ";

const GLYPH: Record<MarkKind, string> = { ok: "✓", fuzzy: "~", warn: "⚠", fail: "✗" };
const COLOUR: Record<MarkKind, number> = { ok: 32, fuzzy: 33, warn: 33, fail: 31 };
const RULE_COLOUR = 90;
const STAR_COLOUR = 36;

function paint(text: string, colour: number, on: boolean): string {
  return on ? `\u001B[${colour}m${text}\u001B[0m` : text;
}

export function clock(at: number): string {
  const time = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
}

/** Whole seconds under a minute, minutes and seconds above it. Nothing here is worth a decimal. */
export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}

/** Pads a field so the one after it starts in the same column on every line. */
export function column(text: string, width: number): string {
  return text.padEnd(width);
}

/**
 * A rule with its parts sunk into it, ending on a fixed tail so the right edge is straight however
 * long the parts are. Too long to fit, it grows rather than truncating: a clipped show name is
 * worse than a ragged edge on one line.
 */
function rule(char: string, parts: string[], tail: string, colour: boolean): string {
  const lead = char.repeat(4);
  const body = parts.length === 0 ? "" : ` ${parts.join(` ${char.repeat(2)} `)} `;
  const drawn = `${lead}${body}`;
  const end = tail ? ` ${tail} ${char.repeat(4)}` : "";
  const fill = Math.max(1, WIDTH - drawn.length - end.length);
  return paint(`${drawn}${char.repeat(fill)}${end}`, RULE_COLOUR, colour);
}

function markOf(mark: Mark, colour: boolean): string {
  return paint([GLYPH[mark.kind], mark.text].filter(Boolean).join(" "), COLOUR[mark.kind], colour);
}

export function formatLine(line: Line, colour = false): string {
  if (line.kind === "show") {
    return rule("━", [`SHOW ${line.number}`, line.name, line.note], clock(line.at), colour);
  }
  if (line.kind === "closed") {
    return rule("━", [`SHOW ${line.number} CLOSED`, line.note], clock(line.at), colour);
  }
  if (line.kind === "round") {
    return rule("─", [`ROUND ${line.number}`, `${line.map} · ${line.type}`], clock(line.at), colour);
  }
  if (line.kind === "note") return rule("─", [line.text], "", colour);

  const body = line.star ? paint(`★ ${line.text}`, STAR_COLOUR, colour) : line.text;
  const head = `${clock(line.at)}${GAP}${column(line.lane, LANE_WIDTH)}${GAP}${body}`;
  if (!line.mark) return head;

  // Plain length, so the alignment does not count escape codes it cannot see.
  const plain = `${clock(line.at)}${GAP}${column(line.lane, LANE_WIDTH)}${GAP}${line.star ? `★ ${line.text}` : line.text}`;
  const mark = markOf(line.mark, colour);
  const width = markOf(line.mark, false).length;
  const pad = WIDTH - plain.length - width;
  return `${head}${pad > 1 ? " ".repeat(pad) : GAP}${mark}`;
}
