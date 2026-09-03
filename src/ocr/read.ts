import { createWorker, PSM, type Worker } from "tesseract.js";
import { frameFrom, type Frame } from "./frame";
import { nameBand, qualifiedCards } from "./grid";
import { identify, type Screen } from "./recognizers";
import { maskToPng } from "./mask";
import { cleanToken, dropLevel } from "./match";
import { nameBox, trophyPill } from "./toast";
import type { Box } from "./geometry";

export interface ShotRead {
  /** Absent when the capture is not a screen worth reading. */
  screen?: Screen;
  /** Raw OCR text, one entry per name found. Matching happens later, against a live roster. */
  tokens: string[];
}

const WINNER_PLATE = { x: 855 / 1920, y: 915 / 1080, w: 260 / 1920, h: 44 / 1080 };

const CUTOFF = { grid: 190, winner: 190 } as const;
/**
 * A pill's white text sits on a translucent lozenge, so what separates the two is whatever level
 * shows through it. On a dark one the low cutoff has the text to itself; on a pale one it takes the
 * whole strip and the mask comes out a solid block. Both are read and the fuller answer kept.
 */
const TOAST_CUTOFFS = [195, 240];

function glyphs(text: string): number {
  return (text.match(/[A-Za-z0-9]/g) ?? []).length;
}
/**
 * How tall each band is blown up to before Tesseract sees it. There is a window either side: too
 * small and it reads nothing, too large and it returns nothing at all for some names while reading
 * others perfectly. A fixed multiplier only holds at one capture size, so this is a target height
 * and the multiplier follows from the band actually in hand.
 */
const TARGET_HEIGHT = { grid: 108, winner: 88, toast: 192 } as const;

function scaleFor(screen: keyof typeof TARGET_HEIGHT, box: Box): number {
  return Math.max(1, Math.round(TARGET_HEIGHT[screen] / box.h));
}

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
  // Worth filing and worth looking at, but never worth reading: see `Screen`.
  if (screen === "field") return { screen, tokens: [] };

  if (screen === "grid") {
    const cards = qualifiedCards(frame);
    const tokens: string[] = [];
    for (const card of cards) {
      const band = nameBand(frame, card);
      // A nameplate is one line. Left to decide for itself, Tesseract breaks a short name into
      // blocks and hands them back out of order — `spibblej 21` as `1 lej 2 spibb`.
      const raw = await textIn(frame, band, CUTOFF.grid, scaleFor("grid", band), PSM.SINGLE_LINE);
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
      scaleFor("winner", winnerBox(frame)),
      PSM.SINGLE_LINE,
    );
    return { screen, tokens: [plate] };
  }

  const pill = nameBox(frame, trophyPill(frame)!);
  const scale = scaleFor("toast", pill);
  let best = "";
  for (const cutoff of TOAST_CUTOFFS) {
    const text = await textIn(frame, pill, cutoff, scale);
    if (glyphs(text) > glyphs(best)) best = text;
  }
  return { screen, tokens: [best] };
}
