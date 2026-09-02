import { createWorker, PSM, type Worker } from "tesseract.js";
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
/**
 * Enough to read a 15px band, no more: the winner plate's text is already tall, and blown up six
 * times Tesseract returns nothing at all for some names while reading others perfectly.
 */
const SCALE = { grid: 6, winner: 2, toast: 8 } as const;

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

async function textIn(
  frame: Frame,
  box: Box,
  cutoff: number,
  scale: number,
  mode: PSM = PSM.AUTO,
): Promise<string> {
  const png = await maskToPng(frame, box, cutoff, scale);
  const worker = await ocrWorker();
  await worker.setParameters({ tessedit_pageseg_mode: mode });
  const { data } = await worker.recognize(png);
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
    // One name on one line: left to work it out, Tesseract sometimes decides there is no text.
    const plate = await textIn(
      frame,
      winnerBox(frame),
      CUTOFF.winner,
      SCALE.winner,
      PSM.SINGLE_LINE,
    );
    return { screen, tokens: [plate] };
  }

  const pill = trophyPill(frame)!;
  return {
    screen,
    tokens: [await textIn(frame, pillBox(frame, pill), CUTOFF.toast, SCALE.toast)],
  };
}
