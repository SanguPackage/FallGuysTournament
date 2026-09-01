# Reading names off the captures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read player names out of ShareX captures and drop them into the admin's empty name fields.

**Architecture:** A pure core plus a thin impure shell. Everything that decides anything — grid
classification, screen identification, roster matching, slot mapping — takes a `Frame` (a pixel
reader) or plain data and is unit-tested against five committed sample frames. Only decoding,
OCR, caching and the server queue touch the outside world.

**Tech Stack:** Bun, TypeScript, `jimp` (pure-JS decode/crop/resize), `tesseract.js` (WASM OCR).

Every constant below was measured against the committed samples, not guessed. Keep them.

---

## File Structure

| File | Responsibility |
|--------------------------------|-----------------------------------------------------|
| `src/ocr/frame.ts`             | `Frame` interface + `frameFrom(path)` via jimp        |
| `src/ocr/geometry.ts`          | Fractional regions → pixel boxes                      |
| `src/ocr/grid.ts`              | Classify the 8×4 qualification board                  |
| `src/ocr/recognizers.ts`       | Identify which screen a frame is                      |
| `src/ocr/mask.ts`              | Min-channel isolation + upscale → PNG buffer          |
| `src/ocr/match.ts`             | Assign each token one roster name, or decline         |
| `src/ocr/read.ts`              | Frame → `ShotRead` (raw tokens, no roster)            |
| `src/ocr/cache.ts`             | Reads keyed on file + mtime, persisted                |
| `src/ocr/autofill.ts`          | Reads + placements + roster → slot fills              |
| `scripts/serve.ts`             | Background OCR queue; `reads` on `/api/state`         |
| `site/admin.ts`                | Apply fills to empty draft fields, badge the source   |
| `src/ocr/samples/*.jpg`        | Five committed frames (already in the worktree)       |

**Why reads store raw tokens, not matched names:** the roster grows as players report their
in-game names. Caching tokens means a late registration fixes every earlier capture without
re-running OCR.

---

## Task 1: Frame and geometry

**Files:**
- Create: `src/ocr/frame.ts`, `src/ocr/geometry.ts`
- Test: `src/ocr/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/geometry.test.ts
import { expect, test } from "bun:test";
import { toPixels } from "./geometry";

test("a fractional region becomes a pixel box in the frame's own size", () => {
  expect(toPixels({ x: 0.5, y: 0.25, w: 0.1, h: 0.2 }, { width: 1920, height: 1080 })).toEqual({
    x: 960,
    y: 270,
    w: 192,
    h: 216,
  });
});

test("a region is rounded, never fractional", () => {
  const box = toPixels({ x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 }, { width: 100, height: 100 });
  expect(Object.values(box).every(Number.isInteger)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/geometry.test.ts`
Expected: FAIL, cannot resolve `./geometry`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/geometry.ts
/** A rectangle in fractions of the frame, so a capture at another resolution still lands. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

export function toPixels(region: Region, size: Size): Box {
  return {
    x: Math.round(region.x * size.width),
    y: Math.round(region.y * size.height),
    w: Math.round(region.w * size.width),
    h: Math.round(region.h * size.height),
  };
}
```

```ts
// src/ocr/frame.ts
import { Jimp } from "jimp";

export interface Frame {
  width: number;
  height: number;
  /** Red, green and blue at a pixel. Reads outside the frame clamp to the edge. */
  at(x: number, y: number): readonly [number, number, number];
}

export function frameFromBitmap(bitmap: {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
}): Frame {
  const { width, height, data } = bitmap;
  return {
    width,
    height,
    at(x, y) {
      const cx = Math.min(Math.max(x, 0), width - 1);
      const cy = Math.min(Math.max(y, 0), height - 1);
      const i = (cy * width + cx) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    },
  };
}

export async function frameFrom(path: string): Promise<Frame> {
  const image = await Jimp.read(path);
  return frameFromBitmap(image.bitmap);
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/geometry.test.ts && bun run typecheck`
Expected: 2 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/geometry.ts src/ocr/geometry.test.ts src/ocr/frame.ts
git commit -m "feat: read a capture as a frame of pixels"
```

---

## Task 2: Classify the qualification board

The board is 8 columns by 4 rows. A card is green when its player got through, magenta when they
went out, blue when the slot is empty. A green card is mostly covered by the player's bean, so a
centre pixel is useless — the fraction of green over the card's inner area is what separates
them. Measured on the samples, green cards score 0.26–0.67 and every other card scores 0.00.

**Files:**
- Create: `src/ocr/grid.ts`
- Test: `src/ocr/grid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/grid.test.ts
import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { qualifiedCards, cardBox, nameBand } from "./grid";

test("the board counts exactly the cards the game says qualified", async () => {
  expect((await qualifiedCards(await frameFrom("src/ocr/samples/grid-15.jpg"))).length).toBe(15);
  expect((await qualifiedCards(await frameFrom("src/ocr/samples/grid-5.jpg"))).length).toBe(5);
});

test("a frame that is not a board has no cards at all", async () => {
  for (const file of ["lobby.jpg", "winner.jpg", "toast.jpg"]) {
    expect((await qualifiedCards(await frameFrom(`src/ocr/samples/${file}`))).length).toBe(0);
  }
});

test("the five qualified cards are the ones the eye can see", async () => {
  const cards = await qualifiedCards(await frameFrom("src/ocr/samples/grid-5.jpg"));
  expect(cards.map((c) => `${c.row},${c.col}`).sort()).toEqual(["0,4", "0,5", "1,2", "2,2", "2,5"]);
});

test("a name band ends at its card's right edge and sits just above it", async () => {
  const frame = await frameFrom("src/ocr/samples/grid-5.jpg");
  const box = nameBand(frame, { row: 0, col: 4 });
  const card = cardBox(frame, { row: 0, col: 4 });
  expect(box.x + box.w).toBeGreaterThanOrEqual(card.x + card.w);
  expect(box.y + box.h).toBeLessThanOrEqual(card.y + 4);
  expect(box.h).toBe(18);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/grid.test.ts`
Expected: FAIL, cannot resolve `./grid`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/grid.ts
import type { Frame } from "./frame";
import type { Box } from "./geometry";

/** Measured off a 1920x1080 capture, held as fractions so another size still lands. */
const LEFT = 435 / 1920;
const RIGHT = 1492 / 1920;
const TOP = 225 / 1080;
const PITCH = 144 / 1080;
export const COLS = 8;
export const ROWS = 4;

/** A green card is mostly bean, so this is the share of card left showing, not a majority. */
const GREEN_SHARE = 0.07;

export interface Card {
  row: number;
  col: number;
}

function isGreen(r: number, g: number, b: number): boolean {
  return g > 120 && g - r > 40 && g - b > 40;
}

function cellWidth(frame: Frame): number {
  return ((RIGHT - LEFT) * frame.width) / COLS;
}

export function cardBox(frame: Frame, card: Card): Box {
  const cw = cellWidth(frame);
  const pitch = PITCH * frame.height;
  return {
    x: Math.round(LEFT * frame.width + cw * card.col),
    y: Math.round(TOP * frame.height + pitch * card.row),
    w: Math.round(cw),
    h: Math.round(pitch),
  };
}

/** The name sits in a thin band directly above its card, ending at the card's crown badge. */
export function nameBand(frame: Frame, card: Card): Box {
  const box = cardBox(frame, card);
  const right = box.x + box.w + 4;
  const width = Math.round(cellWidth(frame) * 2.2);
  return { x: right - width, y: box.y - 15, w: width, h: 18 };
}

function greenShare(frame: Frame, card: Card): number {
  const box = cardBox(frame, card);
  const inset = Math.round(box.w * 0.12);
  let hit = 0;
  let total = 0;
  for (let y = box.y + 14; y < box.y + box.h - 14; y += 3) {
    for (let x = box.x + inset; x < box.x + box.w - inset; x += 3) {
      total += 1;
      if (isGreen(...frame.at(x, y))) hit += 1;
    }
  }
  return total === 0 ? 0 : hit / total;
}

export function qualifiedCards(frame: Frame): Card[] {
  const cards: Card[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (greenShare(frame, { row, col }) > GREEN_SHARE) cards.push({ row, col });
    }
  }
  return cards;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/grid.test.ts && bun run typecheck`
Expected: 4 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/grid.ts src/ocr/grid.test.ts
git commit -m "feat: classify the qualification board"
```

---

## Task 3: Find the toast pill that carried the trophy

The qualified toasts are a right-aligned column of pills. A gold trophy marks whoever finished
first; a blue flag marks everyone else. **Pill order does not track finish order** — in the
Airtime sample the trophy pill sits below the flag pill — so the icon decides and position is
ignored. Measured on the sample the separation is decisive: gold 171 vs 4, blue 0 vs 87.

**Files:**
- Create: `src/ocr/toast.ts`
- Test: `src/ocr/toast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/toast.test.ts
import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { pillBox, trophyPill } from "./toast";

test("the trophy is found on the second pill, not the first", async () => {
  expect(trophyPill(await frameFrom("src/ocr/samples/toast.jpg"))).toBe(1);
});

test("a frame with no toast column has no trophy", async () => {
  for (const file of ["grid-5.jpg", "winner.jpg", "lobby.jpg"]) {
    expect(trophyPill(await frameFrom(`src/ocr/samples/${file}`))).toBeUndefined();
  }
});

test("pills are stacked at a fixed pitch", async () => {
  const frame = await frameFrom("src/ocr/samples/toast.jpg");
  expect(pillBox(frame, 1).y - pillBox(frame, 0).y).toBe(30);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/toast.test.ts`
Expected: FAIL, cannot resolve `./toast`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/toast.ts
import type { Frame } from "./frame";
import type { Box } from "./geometry";

const NAME_X = 1735 / 1920;
const NAME_W = 95 / 1920;
const FIRST_Y = 291 / 1080;
const PITCH = 30 / 1080;
const HEIGHT = 24 / 1080;
const ICON_X = 1820 / 1920;
const ICON_W = 55 / 1920;

/** Enough pills to cover a lobby's worth of qualifiers without running off the screen. */
export const PILLS = 8;

/** The trophy is unmistakably gold; a lone stray pixel is not. */
const GOLD_PIXELS = 40;

export function pillBox(frame: Frame, index: number): Box {
  return {
    x: Math.round(NAME_X * frame.width),
    y: Math.round((FIRST_Y + PITCH * index) * frame.height),
    w: Math.round(NAME_W * frame.width),
    h: Math.round(HEIGHT * frame.height),
  };
}

function goldCount(frame: Frame, index: number): number {
  const box = pillBox(frame, index);
  const x0 = Math.round(ICON_X * frame.width);
  const x1 = x0 + Math.round(ICON_W * frame.width);
  let gold = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = x0; x < x1; x++) {
      const [r, g, b] = frame.at(x, y);
      if (r > 190 && g > 140 && b < 110) gold += 1;
    }
  }
  return gold;
}

/** Which pill finished first, by its trophy. Position in the column says nothing. */
export function trophyPill(frame: Frame): number | undefined {
  let best: { index: number; gold: number } | undefined;
  for (let index = 0; index < PILLS; index++) {
    const gold = goldCount(frame, index);
    if (gold >= GOLD_PIXELS && (best === undefined || gold > best.gold)) best = { index, gold };
  }
  return best?.index;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/toast.test.ts && bun run typecheck`
Expected: 3 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/toast.ts src/ocr/toast.test.ts
git commit -m "feat: find the trophy that marks who finished first"
```

---

## Task 4: Identify which screen a capture is

Colour probes, checked before any OCR runs. A capture matching nothing is skipped.

**Files:**
- Create: `src/ocr/recognizers.ts`
- Test: `src/ocr/recognizers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/recognizers.test.ts
import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { identify } from "./recognizers";

test("each sample is recognised as the screen it is", async () => {
  const cases: [string, string | undefined][] = [
    ["grid-15.jpg", "grid"],
    ["grid-5.jpg", "grid"],
    ["winner.jpg", "winner"],
    ["toast.jpg", "toast"],
  ];
  for (const [file, screen] of cases) {
    expect(identify(await frameFrom(`src/ocr/samples/${file}`))).toBe(screen);
  }
});

test("the lobby is covered in names and is still not a screen we read", async () => {
  expect(identify(await frameFrom("src/ocr/samples/lobby.jpg"))).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/recognizers.test.ts`
Expected: FAIL, cannot resolve `./recognizers`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/recognizers.ts
import type { Frame } from "./frame";
import { qualifiedCards } from "./grid";
import { trophyPill } from "./toast";

export type Screen = "grid" | "winner" | "toast";

/**
 * The winner's nameplate is a white pill under the bean, on a screen whose top-left corner carries
 * the victory rainbow. Both together, because either alone turns up elsewhere.
 */
function isWinner(frame: Frame): boolean {
  const rainbow = frame.at(Math.round(frame.width * 0.01), Math.round(frame.height * 0.06));
  const bright = rainbow.filter((c) => c > 120).length >= 2;
  const plate = frame.at(Math.round(frame.width * 0.41), Math.round(frame.height * 0.87));
  const white = plate.every((c) => c > 200);
  return bright && white;
}

export function identify(frame: Frame): Screen | undefined {
  if (qualifiedCards(frame).length > 0) return "grid";
  if (isWinner(frame)) return "winner";
  if (trophyPill(frame) !== undefined) return "toast";
  return undefined;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/recognizers.test.ts && bun run typecheck`
Expected: 2 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/recognizers.ts src/ocr/recognizers.test.ts
git commit -m "feat: tell the capture screens apart before reading them"
```

---

## Task 5: Isolate white text for OCR

These names are white with a dark outline, drawn over green cards, blue frames, magenta cards and
open sky inside a single strip. A luma threshold cannot separate them. `min(R,G,B)` can, because
white is the only thing high in all three channels. Cutoffs differ per screen: the grid and winner
names sit on dark-enough ground for 190, the toast pills are pale and need 195.

**Files:**
- Create: `src/ocr/mask.ts`
- Test: `src/ocr/mask.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/mask.test.ts
import { expect, test } from "bun:test";
import { frameFromBitmap } from "./frame";
import { maskToPng } from "./mask";

function bitmapOf(pixels: [number, number, number][][]) {
  const height = pixels.length;
  const width = pixels[0]!.length;
  const data = new Uint8Array(width * height * 4);
  pixels.forEach((row, y) =>
    row.forEach(([r, g, b], x) => {
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }),
  );
  return { width, height, data };
}

test("only pixels bright in every channel survive the mask", async () => {
  // A saturated green is bright in one channel; white is bright in all three.
  const frame = frameFromBitmap(
    bitmapOf([
      [[255, 255, 255], [0, 255, 0]],
      [[10, 10, 10], [255, 255, 255]],
    ]),
  );
  const png = await maskToPng(frame, { x: 0, y: 0, w: 2, h: 2 }, 190, 1);
  expect(png.length).toBeGreaterThan(0);
});

test("the mask upscales by the factor asked for", async () => {
  const frame = frameFromBitmap(bitmapOf([[[255, 255, 255], [0, 0, 0]]]));
  const small = await maskToPng(frame, { x: 0, y: 0, w: 2, h: 1 }, 190, 1);
  const big = await maskToPng(frame, { x: 0, y: 0, w: 2, h: 1 }, 190, 6);
  expect(big.length).toBeGreaterThan(small.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/mask.test.ts`
Expected: FAIL, cannot resolve `./mask`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/mask.ts
import { Jimp } from "jimp";
import type { Frame } from "./frame";
import type { Box } from "./geometry";

/**
 * Black glyphs on white, upscaled. Tesseract wants dark text on light ground, and the name bands
 * are around 15px tall — far under what it reads without help.
 */
export async function maskToPng(
  frame: Frame,
  box: Box,
  cutoff: number,
  scale: number,
): Promise<Buffer> {
  const image = new Jimp({ width: box.w, height: box.h, color: 0xffffffff });
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const [r, g, b] = frame.at(box.x + x, box.y + y);
      const value = Math.min(r, g, b) > cutoff ? 0 : 255;
      const i = (y * box.w + x) * 4;
      image.bitmap.data[i] = value;
      image.bitmap.data[i + 1] = value;
      image.bitmap.data[i + 2] = value;
      image.bitmap.data[i + 3] = 255;
    }
  }
  const grown = image.resize({ w: box.w * scale, h: box.h * scale });
  return (await grown.getBuffer("image/png")) as Buffer;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/mask.test.ts && bun run typecheck`
Expected: 2 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/mask.ts src/ocr/mask.test.ts
git commit -m "feat: isolate white name text for recognition"
```

---

## Task 6: Assign each token one roster name

Every tournament player is registered, so the roster is the answer key rather than a spelling aid.
Match **after** segmenting: asking "which roster names appear in this strip?" tests each name
alone, and `Crissti_14` and `Crissti_41` then both match the same blurry token. One token, one
winner.

**Files:**
- Create: `src/ocr/match.ts`
- Test: `src/ocr/match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/match.test.ts
import { expect, test } from "bun:test";
import { assign, cleanToken, normalise } from "./match";

const REAL = [
  "BigMooseLips", "Darkwin067", "Falso_Brasileiro", "Crissti_14", "pdalhome",
  "boncuk_cat", "alexdriv__10", "The_Skibidi_Mon", "DarkRazou", "T800_is_back",
  "rayviSion", "Kotsovolis3250", "BeatrizGamer_100",
];
const NEAR = ["Crissti_41", "pdalhome2", "DarkRazor", "Skibidi_MonF", "boncuk_dog"];

/** Exactly what OCR returned for the five green cards of grid-5.jpg. */
const CARDS = [
  "BigMoosellps . 2:",
  "Darkwin0&7 4",
  "YWHAANTHI (VMAZ ",
  "AIONYIIOX NINA 24",
  "Falso Brasileiro 30",
];

test("the crown's level number is not part of the name", () => {
  expect(cleanToken("BigMoosellps . 2:")).toBe("BigMoosellps");
  expect(cleanToken("Falso Brasileiro 30")).toBe("Falso Brasileiro");
});

test("separators carry no signal, because an underscore reads as a space", () => {
  expect(normalise("Falso Brasileiro")).toBe(normalise("Falso_Brasileiro"));
});

test("every name on the board is matched, with near-misses in the roster", () => {
  const got = assign(CARDS.map(cleanToken), [...REAL, ...NEAR]);
  expect(got.map((m) => m.name)).toEqual([
    "BigMooseLips",
    "Darkwin067",
    undefined,
    undefined,
    "Falso_Brasileiro",
  ]);
});

test("a name the roster does not hold falls through to what was read", () => {
  const [only] = assign(["Newcomer_77"], REAL);
  expect(only!.name).toBeUndefined();
  expect(only!.value).toBe("Newcomer_77");
});

test("two roster names a character apart make the matcher decline, never guess", () => {
  const [only] = assign([cleanToken("Falso Brasileiro 30")], [...REAL, "Falso_Brasileira"]);
  expect(only!.name).toBeUndefined();
});

test("nobody qualifies twice, so a roster name is used at most once", () => {
  const got = assign(["BigMoosellps", "BigMooseLips"], REAL);
  expect(got.filter((m) => m.name === "BigMooseLips").length).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/match.test.ts`
Expected: FAIL, cannot resolve `./match`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/match.ts
/** Glyphs Tesseract trades for one another at this size. */
const CONFUSABLE: Record<string, string> = {
  "0": "o", "1": "l", "5": "s", "8": "b", "6": "g", "2": "z",
};

const ACCEPT = 0.45;
/** How far clear the winner must be. Below this the two candidates are the same read. */
const MARGIN = 0.08;

export interface Assignment {
  token: string;
  /** The roster name, when one won clearly. */
  name?: string;
  /** What to put in the field: the roster name, or the token as read. */
  value: string;
}

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .split("")
    .map((c) => CONFUSABLE[c] ?? c)
    .join("");
}

/** Strips the stray glyphs around a name and the crown's level number after it. */
export function cleanToken(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9_\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\d{1,3}$/, "")
    .trim();
}

function distance(a: string, b: string): number {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return 1;
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      current.push(
        Math.min(
          previous[j]! + 1,
          current[j - 1]! + 1,
          previous[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[y.length]! / Math.max(x.length, y.length);
}

/**
 * One roster name per token, best pairing first. A name already taken is not offered again —
 * nobody qualifies twice — and a token whose winner does not beat the runner-up is left as read.
 */
export function assign(tokens: string[], roster: string[]): Assignment[] {
  const ranked = tokens.map((token) =>
    roster
      .map((name) => ({ name, d: distance(token, name) }))
      .sort((a, b) => a.d - b.d),
  );

  const pairs = ranked
    .flatMap((candidates, index) => {
      const best = candidates[0];
      const runnerUp = candidates[1];
      if (!best || best.d > ACCEPT) return [];
      if (runnerUp !== undefined && runnerUp.d - best.d < MARGIN) return [];
      return [{ index, name: best.name, d: best.d }];
    })
    .sort((a, b) => a.d - b.d);

  const taken = new Set<string>();
  const won = new Map<number, string>();
  for (const pair of pairs) {
    if (taken.has(pair.name) || won.has(pair.index)) continue;
    taken.add(pair.name);
    won.set(pair.index, pair.name);
  }

  return tokens.map((token, index) => {
    const name = won.get(index);
    return name === undefined ? { token, value: token } : { token, name, value: name };
  });
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/match.test.ts && bun run typecheck`
Expected: 6 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/match.ts src/ocr/match.test.ts
git commit -m "feat: assign each read name one roster entry, or decline"
```

---

## Task 7: Read one capture

Reads store **raw tokens**, never matched names, so a player registering late fixes every earlier
capture without re-running OCR.

**Files:**
- Create: `src/ocr/read.ts`
- Test: `src/ocr/read.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/read.test.ts
import { expect, test } from "bun:test";
import { readShot } from "./read";
import { cleanToken, assign } from "./match";

test("the winner screen names the winner", async () => {
  const read = await readShot("src/ocr/samples/winner.jpg");
  expect(read.screen).toBe("winner");
  expect(assign(read.tokens.map(cleanToken), ["Diego_9942"])[0]!.name).toBe("Diego_9942");
}, 60_000);

test("the toast names whoever holds the trophy", async () => {
  const read = await readShot("src/ocr/samples/toast.jpg");
  expect(read.screen).toBe("toast");
  expect(assign([cleanToken(read.tokens[0]!)], ["Serxav_9", "Chi-_-lli"])[0]!.name).toBe("Serxav_9");
}, 60_000);

test("the board gives one token per qualified card", async () => {
  const read = await readShot("src/ocr/samples/grid-5.jpg");
  expect(read.screen).toBe("grid");
  expect(read.tokens.length).toBe(5);
}, 120_000);

test("the lobby yields no screen and no names", async () => {
  const read = await readShot("src/ocr/samples/lobby.jpg");
  expect(read.screen).toBeUndefined();
  expect(read.tokens).toEqual([]);
}, 60_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/read.test.ts`
Expected: FAIL, cannot resolve `./read`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/read.ts
import { createWorker, type Worker } from "tesseract.js";
import { frameFrom, type Frame } from "./frame";
import { nameBand, qualifiedCards } from "./grid";
import { identify, type Screen } from "./recognizers";
import { maskToPng } from "./mask";
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
    const tokens: string[] = [];
    for (const card of qualifiedCards(frame)) {
      tokens.push(await textIn(frame, nameBand(frame, card), CUTOFF.grid, SCALE.grid));
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
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/read.test.ts && bun run typecheck`
Expected: 4 pass. First run downloads the model, so allow time.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/read.ts src/ocr/read.test.ts
git commit -m "feat: read the names off one capture"
```

---

## Task 8: Map a read onto a slot

`placeShots` already tags a capture taken after the round before the final with `namesFinalists`,
so a board read knows whether it means finalists or a mid-show qualification.

**Files:**
- Create: `src/ocr/autofill.ts`
- Test: `src/ocr/autofill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/autofill.test.ts
import { expect, test } from "bun:test";
import { fillsFor } from "./autofill";
import type { PlacedShot } from "../screenshots";
import type { ShotRead } from "./read";

const ROSTER = ["Diego_9942", "Serxav_9", "BigMooseLips"];

function shot(file: string, extra: Partial<PlacedShot> = {}): PlacedShot {
  return { file, takenAt: 0, showIndex: 0, ...extra };
}

test("a board read after the round before the final becomes the finalists", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 2, namesFinalists: true })];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942", "Serxav_9"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "finalists", names: ["Diego_9942", "Serxav_9"], from: "g.jpg" },
  ]);
});

test("a board read anywhere else names nobody, because only the final is scored", () => {
  const shots = [shot("g.jpg", { slot: "round", roundIndex: 0 })];
  const reads: Record<string, ShotRead> = {
    "g.jpg": { screen: "grid", tokens: ["Diego_9942"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([]);
});

test("the winner screen fills the winners", () => {
  const shots = [shot("w.jpg", { slot: "winners" })];
  const reads: Record<string, ShotRead> = {
    "w.jpg": { screen: "winner", tokens: ["R- Diego_9942"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "winners", names: ["Diego_9942"], from: "w.jpg" },
  ]);
});

test("the toast fills the round it was taken in", () => {
  const shots = [shot("t.jpg", { slot: "round", roundIndex: 1 })];
  const reads: Record<string, ShotRead> = {
    "t.jpg": { screen: "toast", tokens: ["-Serxav 9"] },
  };
  expect(fillsFor(shots, reads, ROSTER)).toEqual([
    { showIndex: 0, slot: "first", roundIndex: 1, names: ["Serxav_9"], from: "t.jpg" },
  ]);
});

test("a capture placed in no show fills nothing", () => {
  const reads: Record<string, ShotRead> = {
    "x.jpg": { screen: "winner", tokens: ["Diego_9942"] },
  };
  expect(fillsFor([{ file: "x.jpg", takenAt: 0 }], reads, ROSTER)).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/autofill.test.ts`
Expected: FAIL, cannot resolve `./autofill`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/autofill.ts
import type { PlacedShot } from "../screenshots";
import { assign, cleanToken } from "./match";
import type { ShotRead } from "./read";

export interface SlotFill {
  showIndex: number;
  slot: "first" | "finalists" | "winners";
  roundIndex?: number;
  names: string[];
  /** The capture the names were read off, so a wrong one can be traced back. */
  from: string;
}

export function fillsFor(
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
  roster: string[],
): SlotFill[] {
  const fills: SlotFill[] = [];

  for (const shot of shots) {
    const read = reads[shot.file];
    if (!read?.screen || shot.showIndex === undefined || read.tokens.length === 0) continue;

    const names = assign(read.tokens.map(cleanToken), roster)
      .map((match) => match.value)
      .filter(Boolean);
    if (names.length === 0) continue;

    if (read.screen === "grid") {
      // A board turns up after every round. Only the one naming the finalists is worth anything.
      if (shot.namesFinalists === true) {
        fills.push({ showIndex: shot.showIndex, slot: "finalists", names, from: shot.file });
      }
      continue;
    }

    if (read.screen === "winner") {
      fills.push({ showIndex: shot.showIndex, slot: "winners", names, from: shot.file });
      continue;
    }

    if (shot.roundIndex !== undefined) {
      fills.push({
        showIndex: shot.showIndex,
        slot: "first",
        roundIndex: shot.roundIndex,
        names: [names[0]!],
        from: shot.file,
      });
    }
  }

  return fills;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/autofill.test.ts && bun run typecheck`
Expected: 5 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/autofill.ts src/ocr/autofill.test.ts
git commit -m "feat: map a capture's names onto the slot they belong in"
```

---

## Task 9: Cache reads across restarts

**Files:**
- Create: `src/ocr/cache.ts`
- Test: `src/ocr/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/cache.test.ts
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCache, saveCache, cacheKey } from "./cache";

test("a cache survives a round trip through disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ocr-"));
  const path = join(dir, "reads.json");
  await saveCache(path, { "a.jpg@5": { screen: "winner", tokens: ["Diego_9942"] } });
  expect(await loadCache(path)).toEqual({ "a.jpg@5": { screen: "winner", tokens: ["Diego_9942"] } });
  await rm(dir, { recursive: true, force: true });
});

test("a missing cache reads as empty rather than throwing", async () => {
  expect(await loadCache(join(tmpdir(), "nope", "reads.json"))).toEqual({});
});

test("a rewritten capture gets a new key", () => {
  expect(cacheKey("a.jpg", 5)).not.toBe(cacheKey("a.jpg", 6));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/cache.test.ts`
Expected: FAIL, cannot resolve `./cache`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/cache.ts
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ShotRead } from "./read";

export type ReadCache = Record<string, ShotRead>;

/** A capture copied over keeps its name but not its mtime, so both go in the key. */
export function cacheKey(file: string, mtimeMs: number): string {
  return `${file}@${Math.round(mtimeMs)}`;
}

export async function loadCache(path: string): Promise<ReadCache> {
  try {
    return (await Bun.file(path).json()) as ReadCache;
  } catch {
    return {};
  }
}

export async function saveCache(path: string, cache: ReadCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(cache, null, 2)}\n`);
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/cache.test.ts && bun run typecheck`
Expected: 3 pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/cache.ts src/ocr/cache.test.ts
git commit -m "feat: keep read names across a server restart"
```

---

## Task 10: Serve the reads

OCR takes 1–2s per capture and `/api/state` is polled every few seconds, so the poll must never
wait on it. A single background worker drains a queue; the endpoint answers from cache only, and a
read that is not ready simply turns up on a later poll.

**Files:**
- Create: `src/ocr/queue.ts`
- Modify: `scripts/serve.ts`
- Test: `src/ocr/queue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ocr/queue.test.ts
import { expect, test } from "bun:test";
import { ReadQueue } from "./queue";

test("each capture is read once, however often it is offered", async () => {
  let calls = 0;
  const queue = new ReadQueue(async () => {
    calls += 1;
    return { tokens: [] };
  });
  queue.offer([{ key: "a@1", path: "a.jpg" }, { key: "a@1", path: "a.jpg" }]);
  queue.offer([{ key: "a@1", path: "a.jpg" }]);
  await queue.drained();
  expect(calls).toBe(1);
});

test("reads land in the cache under their key", async () => {
  const queue = new ReadQueue(async () => ({ screen: "winner" as const, tokens: ["Diego"] }));
  queue.offer([{ key: "w@2", path: "w.jpg" }]);
  await queue.drained();
  expect(queue.cache()["w@2"]).toEqual({ screen: "winner", tokens: ["Diego"] });
});

test("one capture failing does not stop the next", async () => {
  const queue = new ReadQueue(async (path) => {
    if (path === "bad.jpg") throw new Error("unreadable");
    return { tokens: ["ok"] };
  });
  queue.offer([{ key: "bad@1", path: "bad.jpg" }, { key: "good@1", path: "good.jpg" }]);
  await queue.drained();
  expect(queue.cache()["good@1"]).toEqual({ tokens: ["ok"] });
  expect(queue.cache()["bad@1"]).toEqual({ tokens: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ocr/queue.test.ts`
Expected: FAIL, cannot resolve `./queue`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ocr/queue.ts
import type { ReadCache } from "./cache";
import type { ShotRead } from "./read";

export interface Job {
  key: string;
  path: string;
}

/**
 * One capture at a time in the background. The admin polls every few seconds and must never wait
 * on a read, so results are collected here and answered from the cache.
 */
export class ReadQueue {
  private readonly done: ReadCache = {};
  private readonly queued = new Set<string>();
  private pending: Job[] = [];
  private running?: Promise<void>;

  constructor(private readonly read: (path: string) => Promise<ShotRead>) {}

  cache(): ReadCache {
    return this.done;
  }

  offer(jobs: Job[]): void {
    for (const job of jobs) {
      if (this.queued.has(job.key) || this.done[job.key]) continue;
      this.queued.add(job.key);
      this.pending.push(job);
    }
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
  }

  /** Resolves once nothing is left to read. Used by the tests; the server never waits. */
  async drained(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      try {
        this.done[job.key] = await this.read(job.path);
      } catch {
        // A capture still being written cannot be read. Record the miss so it is not retried.
        this.done[job.key] = { tokens: [] };
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/ocr/queue.test.ts && bun run typecheck`
Expected: 3 pass, typecheck clean.

- [ ] **Step 5: Wire it into the server**

In `scripts/serve.ts`, add the imports beside the existing ones:

```ts
import { ReadQueue } from "../src/ocr/queue";
import { readShot } from "../src/ocr/read";
import { cacheKey, loadCache, saveCache } from "../src/ocr/cache";
import { fillsFor } from "../src/ocr/autofill";
import { resolveShot } from "../src/shot-folder";
import type { Players } from "../src/types";
```

Above `const server = Bun.serve({`:

```ts
const CACHE_PATH = ".ocr-cache/reads.json";

const reader = new ReadQueue(readShot);
Object.assign(reader.cache(), await loadCache(CACHE_PATH));

/** Reading is a convenience: a capture that cannot be read must not stop the admin loading. */
function queueReads(dir: string | undefined, shots: { file: string; takenAt: number }[]): void {
  if (!dir) return;
  const jobs = shots.flatMap((shot) => {
    const path = resolveShot(dir, shot.file);
    return path ? [{ key: cacheKey(shot.file, shot.takenAt), path }] : [];
  });
  reader.offer(jobs);
}

function readsFor(shots: { file: string; takenAt: number }[]) {
  const cache = reader.cache();
  return Object.fromEntries(
    shots.flatMap((shot) => {
      const read = cache[cacheKey(shot.file, shot.takenAt)];
      return read ? [[shot.file, read] as const] : [];
    }),
  );
}

setInterval(() => void saveCache(CACHE_PATH, reader.cache()), 10_000);
```

Inside the `/api/state` handler, after `shots` is computed, replace the returned object's tail so
it also carries the reads and the fills. The existing handler ends with
`shots: await placed(shotDir, shows, event.date),`; change that block to:

```ts
      const shots = await placed(shotDir, shows, event.date);
      queueReads(shotDir, shots);
      const players = (await Bun.file(PLAYERS_PATH).json()) as Players;
      const roster = players.players.flatMap((player) => (player.ingame ? [player.ingame] : []));
      const reads = readsFor(shots);

      return json({
        players,
        event,
        showNames: Object.keys(
          ((await Bun.file(SHOWS_PATH).json()) as { shows: Record<string, unknown> }).shows,
        ).sort(),
        order: parseShowOrder(await Bun.file("docs/rules.md").text()),
        logPath: logPath ?? null,
        shows,
        times: absoluteTimes(shows, event.date),
        shotDir: shotDir ?? null,
        shots,
        fills: fillsFor(shots, reads, roster),
      });
```

- [ ] **Step 6: Verify the server still serves**

Run: `bun run build && (PORT=3123 bun run dev &) && sleep 3 && curl -s localhost:3123/api/state | head -c 300 && kill %1`
Expected: JSON including a `fills` key.

- [ ] **Step 7: Commit**

```bash
git add src/ocr/queue.ts src/ocr/queue.test.ts scripts/serve.ts
git commit -m "feat: read captures in the background and serve what they named"
```

---

## Task 11: Fill the empty fields

A fill lands only in a slot that is currently blank. Anything typed, or filled earlier and since
corrected, is never touched again. Because a fill arrives without being asked for, every field it
touches says which capture it came from.

**Files:**
- Modify: `site/admin-model.ts`, `site/admin.ts`, `site/admin.css`
- Test: `site/admin-model.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `site/admin-model.test.ts`:

```ts
import { applyFills } from "./admin-model";
import type { SlotFill } from "../src/ocr/autofill";

function draftOf(): ShowDraft {
  return {
    name: "Solos",
    rounds: [
      { map: "Wall Guys", type: "race", first: "" },
      { map: "Airtime", type: "hunt", first: "Optinux_Prime" },
    ],
    finalists: ["", ""],
    winners: [""],
  };
}

const FILLS: SlotFill[] = [
  { showIndex: 0, slot: "first", roundIndex: 0, names: ["Serxav_9"], from: "a.jpg" },
  { showIndex: 0, slot: "first", roundIndex: 1, names: ["Diego_9942"], from: "b.jpg" },
  { showIndex: 0, slot: "finalists", names: ["Diego_9942", "Serxav_9"], from: "c.jpg" },
  { showIndex: 0, slot: "winners", names: ["Diego_9942"], from: "d.jpg" },
];

test("a fill lands only where nothing has been typed", () => {
  const draft = draftOf();
  expect(applyFills(draft, FILLS, 0, new Map())).toBe(true);
  expect(draft.rounds[0]!.first).toBe("Serxav_9");
  expect(draft.rounds[1]!.first).toBe("Optinux_Prime");
  expect(draft.finalists).toEqual(["Diego_9942", "Serxav_9"]);
  expect(draft.winners).toEqual(["Diego_9942"]);
});

test("every filled field records the capture it was read off", () => {
  const sources = new Map<string, string>();
  applyFills(draftOf(), FILLS, 0, sources);
  expect(sources.get("show:0:round:0:first")).toBe("a.jpg");
  expect(sources.get("show:0:finalist:0")).toBe("c.jpg");
  expect(sources.get("show:0:winner:0")).toBe("d.jpg");
  expect(sources.has("show:0:round:1:first")).toBe(false);
});

test("applying the same fills twice changes nothing the second time", () => {
  const draft = draftOf();
  expect(applyFills(draft, FILLS, 0, new Map())).toBe(true);
  expect(applyFills(draft, FILLS, 0, new Map())).toBe(false);
});

test("a fill for another show is ignored", () => {
  const draft = draftOf();
  const other: SlotFill[] = [
    { showIndex: 1, slot: "finalists", names: ["Diego_9942"], from: "c.jpg" },
  ];
  expect(applyFills(draft, other, 0, new Map())).toBe(false);
  expect(draft.finalists).toEqual(["", ""]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test site/admin-model.test.ts`
Expected: FAIL, `applyFills` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `site/admin-model.ts`:

```ts
import type { SlotFill } from "../src/ocr/autofill";

/** The same keys `nameInput` files its fields under, so a source can be looked up per field. */
function fieldKey(showIndex: number, fill: SlotFill, slot: number): string {
  if (fill.slot === "first") return `show:${showIndex}:round:${fill.roundIndex}:first`;
  return `show:${showIndex}:${fill.slot === "finalists" ? "finalist" : "winner"}:${slot}`;
}

/**
 * Drops read names into blank fields only. A field already holding something was either typed or
 * corrected, and a later capture disagreeing with it must not undo that.
 */
export function applyFills(
  draft: ShowDraft,
  fills: SlotFill[],
  showIndex: number,
  sources: Map<string, string>,
): boolean {
  let changed = false;

  for (const fill of fills) {
    if (fill.showIndex !== showIndex) continue;

    if (fill.slot === "first") {
      const round = fill.roundIndex === undefined ? undefined : draft.rounds[fill.roundIndex];
      const name = fill.names[0];
      if (round && !round.first && name) {
        round.first = name;
        sources.set(fieldKey(showIndex, fill, 0), fill.from);
        changed = true;
      }
      continue;
    }

    const slot = fill.slot === "finalists" ? draft.finalists : draft.winners;
    for (const name of fill.names) {
      if (slot.includes(name)) continue;
      const blank = slot.indexOf("");
      if (blank === -1) break;
      slot[blank] = name;
      sources.set(fieldKey(showIndex, fill, blank), fill.from);
      changed = true;
    }
  }

  return changed;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test site/admin-model.test.ts && bun run typecheck`
Expected: all pass, typecheck clean.

- [ ] **Step 5: Show the source on every filled field**

In `site/admin.ts`, add to the imports:

```ts
import type { SlotFill } from "../src/ocr/autofill";
import { applyFills } from "./admin-model";
```

Add `fills` to the `State` interface (line 22) beside `shots`:

```ts
  fills: SlotFill[];
```

Beside `const drafts = new Map<number, ShowDraft>();` (line 80):

```ts
/** Which capture filled each field, keyed as `nameInput` keys them. */
const filledFrom = new Map<string, string>();
```

Replace `nameInput` (line 363) so a filled field says where it came from:

```ts
function nameInput(key: string, value: string, onChange: (value: string) => void): HTMLInputElement {
  const input = el("input", { type: "text", list: "registered", value, placeholder: "name" });
  input.dataset.focusKey = key;
  const source = filledFrom.get(key);
  if (source && value) {
    input.classList.add("read");
    input.title = `Read from ${source}`;
  }
  input.addEventListener("input", () => {
    filledFrom.delete(key);
    input.classList.remove("read");
    input.removeAttribute("title");
    onChange(input.value);
  });
  return input;
}
```

In `watchLog`, replace the `seen` and `signature` lines so a new fill counts as a change:

```ts
  let seen = JSON.stringify([state.shows, state.shots, state.times, state.fills]);
```

```ts
    const signature = JSON.stringify([next.shows, next.shots, next.times, next.fills]);
```

and after `state.times = next.times;` add:

```ts
    state.fills = next.fills;
    // Only the show being typed takes fills; the ones already saved are finished with.
    const draft = drafts.get(selectedShow);
    if (draft) applyFills(draft, next.fills, selectedShow, filledFrom);
```

- [ ] **Step 6: Mark the filled fields**

Append to `site/admin.css`:

```css
input.read {
  border-color: #2f7d4f;
  background: #eefaf1;
}
```

- [ ] **Step 7: Verify**

Run: `bun test && bun run typecheck && bun run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add site/admin-model.ts site/admin-model.test.ts site/admin.ts site/admin.css
git commit -m "feat: fill blank name fields from the captures"
```

---

## Task 12: Document it

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a section after "Screenshots"**

```markdown
## Reading names off the captures

The admin reads the captures and fills in the names it finds. Three screens are read: the
qualification board names the finalists, the winner screen names the winner, and the qualified
toast names whoever finished the round first — by its gold trophy, not by its place in the column.

Names are matched against the `ingame` names in `data/players.json`. Every tournament player is
registered, so the roster is the answer key rather than a spelling aid, and matching declines
rather than guesses when two candidates are equally close. A name the roster does not hold goes in
as read.

Only blank fields are filled. Anything typed is left alone, so a correction stays corrected.

The first run downloads Tesseract's English model, about 15MB, into `.ocr-cache/`. Do that before
the event — nothing after the first run needs the network. Read names are cached in the same
folder, keyed on the file and its modified time.

Not read: the lobby's **View Names** screen, whose nametags follow beans around in 3D and overlap
into pileups, and any name that is not written in the Latin alphabet.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: describe reading names off the captures"
```

---

## Task 13: Merge back

- [ ] **Step 1: Full green**

Run: `bun test && bun run typecheck && bun run build`
Expected: all pass.

- [ ] **Step 2: Merge**

```bash
git -C ../../.. merge --no-ff worktree-ocr-names -m "feat: read player names off the captures"
```

Confirm with the user before merging — the main checkout may hold uncommitted event data.
