import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { frameFrom } from "./frame";
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

  test(`${folder}: every screen reads as ${want.screen ?? "nothing worth reading"}`, async () => {
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
  });
}

test("the trophy names the player who finished first", async () => {
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
});
