import { createWorker, type Worker } from "tesseract.js";
import { frameFrom, type Frame } from "./frame";
import { nameBand, qualifiedCards } from "./grid";
import { identify, type Screen } from "./recognizers";
import { maskToPng } from "./mask";
import { cleanToken, dropLevel } from "./match";
import { pillBox, trophyPill } from "./toast";
import type { Box } from "./geometry";

export interface ShotRead {
  /** Absent when the capture is not a screen worth reading. */
  screen?: Screen;
  /** Raw OCR text, one entry per name found. Matching happens later, against a live roster. */
  tokens: string[];
}

const WINNER_PLATE = { x: 855 / 1920, y: 915 / 1080, w: 260 / 1920, h: 44 / 1080 };

/** The toast pills are pale, so their text needs a higher cutoff than the rest. */
const CUTOFF = { grid: 190, winner: 190, toast: 195 } as const;
const SCALE = { grid: 6, winner: 6, toast: 8 } as const;

let worker: Worker | undefined;

async function ocrWorker(): Promise<Worker> {
  // The model is ~15MB and fetched once. Kept outside node_modules so a reinstall does not bin it.
  worker ??= await createWorker("eng", 1, { cachePath: ".ocr-cache" });
  return worker;
}

export async function closeReader(): Promise<void> {
  await worker?.terminate();
  worker = undefined;
}

async function textIn(frame: Frame, box: Box, cutoff: number, scale: number): Promise<string> {
  const png = await maskToPng(frame, box, cutoff, scale);
  const { data } = await (await ocrWorker()).recognize(png);
  return data.text.trim().replace(/\s+/g, " ");
}

function winnerBox(frame: Frame): Box {
  return {
    x: Math.round(WINNER_PLATE.x * frame.width),
    y: Math.round(WINNER_PLATE.y * frame.height),
    w: Math.round(WINNER_PLATE.w * frame.width),
    h: Math.round(WINNER_PLATE.h * frame.height),
  };
}

export async function readShot(path: string): Promise<ShotRead> {
  const frame = await frameFrom(path);
  const screen = identify(frame);
  if (screen === undefined) return { tokens: [] };

  if (screen === "grid") {
    const cards = qualifiedCards(frame);
    const tokens: string[] = [];
    for (const card of cards) {
      const raw = await textIn(frame, nameBand(frame, card, cards), CUTOFF.grid, SCALE.grid);
      tokens.push(dropLevel(cleanToken(raw)));
    }
    return { screen, tokens };
  }

  if (screen === "winner") {
    return { screen, tokens: [await textIn(frame, winnerBox(frame), CUTOFF.winner, SCALE.winner)] };
  }

  const pill = trophyPill(frame)!;
  return {
    screen,
    tokens: [await textIn(frame, pillBox(frame, pill), CUTOFF.toast, SCALE.toast)],
  };
}
