import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { Jimp } from "jimp";
import { CLASSIFY_HEIGHT } from "../capture/command";
import { frameFrom, frameFromBitmap } from "./frame";
import { cropBars } from "./letterbox";
import { identify, type Screen } from "./recognizers";
import { trophyPill } from "./toast";

/**
 * Screens shot at the FOM 2026 event, sorted by eye. The folder says what `identify` must answer;
 * `manifest.json` says which pill carries the trophy, and names the player, so a fixture asserts
 * who came first rather than only that something was found.
 */
const ROOT = `${import.meta.dir}/../../fixtures`;

interface Manifest {
  folders: Record<string, { screen: Screen | null }>;
  files: Record<string, { trophy?: number | null; first?: string }>;
}

const manifest = (await Bun.file(`${ROOT}/manifest.json`).json()) as Manifest;

for (const [folder, want] of Object.entries(manifest.folders)) {
  const names = (await readdir(`${ROOT}/${folder}`)).sort();

  test(
    `${folder}: every screen reads as ${want.screen ?? "nothing worth reading"}`,
    async () => {
      const wrong: string[] = [];
      for (const name of names) {
        // A round nobody has finished yet looks exactly like one somebody has: the eliminated banner
        // wears a crown where the pill wears its trophy. Only the clock separates them, so that
        // fixture is asserted against `fillsFor` instead.
        if (name.startsWith("NOT-")) continue;
        const got = identify(await frameFrom(`${ROOT}/${folder}/${name}`));
        const expected = want.screen ?? undefined;
        if (got !== expected) wrong.push(`${name}: wanted ${expected ?? "nothing"}, got ${got ?? "nothing"}`);
      }
      expect(wrong).toEqual([]);
    },
    // A folder of 4K boards takes longer than the default allows.
    60_000,
  );
}

test(
  "the trophy names the player who finished first",
  async () => {
    const wrong: string[] = [];
    for (const [path, want] of Object.entries(manifest.files)) {
      if (want.trophy === undefined || want.trophy === null) continue;
      const got = trophyPill(await frameFrom(`${ROOT}/${path}`));
      const expected = want.trophy ?? undefined;
      if (got !== expected) {
        wrong.push(`${path}: wanted ${expected ?? "nothing"}${want.first ? ` (${want.first})` : ""}, got ${got ?? "nothing"}`);
      }
    }
    expect(wrong).toEqual([]);
  },
  60_000,
);

/**
 * `captureMoment` classifies a scaled copy rather than the 4K frame, which is most of what a pass
 * costs. Every verdict has to survive that, or the saving is bought with lost moments.
 */
test(
  `every screen still reads the same at ${CLASSIFY_HEIGHT} tall`,
  async () => {
    const wrong: string[] = [];
    for (const [folder, want] of Object.entries(manifest.folders)) {
      for (const name of (await readdir(`${ROOT}/${folder}`)).sort()) {
        if (name.startsWith("NOT-")) continue;
        const image = await Jimp.read(`${ROOT}/${folder}/${name}`);
        if (image.bitmap.height > CLASSIFY_HEIGHT) image.resize({ h: CLASSIFY_HEIGHT });
        const got = identify(cropBars(frameFromBitmap(image.bitmap)));
        const expected = want.screen ?? undefined;
        if (got !== expected) wrong.push(`${folder}/${name}: wanted ${expected ?? "nothing"}, got ${got ?? "nothing"}`);
      }
    }
    expect(wrong).toEqual([]);
  },
  60_000,
);

test(
  `the trophy still names the right player at ${CLASSIFY_HEIGHT} tall`,
  async () => {
    const wrong: string[] = [];
    for (const [path, want] of Object.entries(manifest.files)) {
      if (want.trophy === undefined || want.trophy === null) continue;
      const image = await Jimp.read(`${ROOT}/${path}`);
      if (image.bitmap.height > CLASSIFY_HEIGHT) image.resize({ h: CLASSIFY_HEIGHT });
      const got = trophyPill(cropBars(frameFromBitmap(image.bitmap)));
      if (got !== want.trophy) wrong.push(`${path}: wanted ${want.trophy}, got ${got ?? "nothing"}`);
    }
    expect(wrong).toEqual([]);
  },
  60_000,
);
