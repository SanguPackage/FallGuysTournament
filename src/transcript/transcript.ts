import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { formatLine, type Lane, type Line } from "./format";

export type Level = "quiet" | "normal" | "trace";

/** Loudest level a lane still shows at. A rule is never filtered — it is what makes the rest findable. */
const LANE_LEVEL: Record<Lane, Level> = {
  log: "quiet",
  fill: "quiet",
  admin: "quiet",
  clip: "normal",
  shots: "normal",
  shot: "normal",
  ocr: "normal",
  queue: "trace",
};

const RANK: Record<Level, number> = { quiet: 0, normal: 1, trace: 2 };

export type Entry = Line & { level?: Level };

export interface TranscriptOptions {
  level: Level;
  colour: boolean;
  out: (text: string) => void;
  /** Absent when there is nowhere to write, which is not a reason to lose the terminal. */
  file?: (text: string) => void;
  /** Every line, before any filtering, so the per-show transcripts can be cut from them. */
  tap?: (line: Entry) => void;
}

/**
 * The file always gets everything, whatever the terminal is set to. It costs nothing and it is the
 * only record once the scrollback is gone.
 */
export class Transcript {
  constructor(private readonly options: TranscriptOptions) {}

  write(line: Entry): void {
    this.options.tap?.(line);
    this.options.file?.(formatLine(line));
    if (this.shows(line)) this.options.out(formatLine(line, this.options.colour));
  }

  private shows(line: Entry): boolean {
    if (line.kind !== "entry") return true;
    return RANK[line.level ?? LANE_LEVEL[line.lane]] <= RANK[this.options.level];
  }
}

/** One file for the evening, at the root of the capture tree the show folders sit in. */
export function transcriptPath(captureDir: string, date: string): string {
  return `${captureDir.replace(/\/+$/, "")}/${date}.transcript.txt`;
}

export interface TranscriptFile {
  (text: string): void;
  close(): Promise<void>;
}

export async function openTranscriptFile(path: string): Promise<TranscriptFile> {
  await mkdir(dirname(path), { recursive: true });
  const stream = createWriteStream(path, { flags: "a" });
  const write: TranscriptFile = (text: string) => {
    stream.write(`${text}\n`);
  };
  write.close = () =>
    new Promise<void>((resolve) => {
      stream.end(resolve);
    });
  return write;
}
