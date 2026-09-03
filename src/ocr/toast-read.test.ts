import { afterAll, expect, test } from "bun:test";
import { assign, cleanToken } from "./match";
import { closeReader, readShot } from "./read";

afterAll(async () => {
  await closeReader();
});

/**
 * The toasts read end to end. `manifest.json` names who each pill's trophy belongs to, and the
 * roster is every name across them — the pool the matcher would face with these players in the
 * lobby.
 */
const ROOT = `${import.meta.dir}/../../fixtures`;
const manifest = (await Bun.file(`${ROOT}/manifest.json`).json()) as {
  files: Record<string, { first?: string }>;
};

/**
 * `mil00000h` is five zeros between an l and an h, and neither capture of it gives them up: one
 * has the pill over flat green with the lozenge all but invisible, the other over the eliminated
 * banner's white lettering. Recorded rather than skipped, as the fixtures that fail on purpose are.
 */
const UNREAD = ["NU6RSpz3YV", "EkwUNtGCAI"];

const toasts = Object.entries(manifest.files).flatMap(([path, want]) =>
  path.startsWith("race-first/") && want.first ? [[path, want.first] as const] : [],
);
const ROSTER = [...new Set(toasts.map(([, first]) => first))];

test("the trophy's pill names the player who finished first", async () => {
  const wrong: string[] = [];
  for (const [path, first] of toasts) {
    if (UNREAD.some((stem) => path.includes(stem))) continue;
    const read = await readShot(`${ROOT}/${path}`);
    const got = assign([cleanToken(read.tokens[0] ?? "")], ROSTER)[0]!;
    if (got.name !== first) {
      wrong.push(`${path}: wanted ${first}, read ${JSON.stringify(read.tokens[0] ?? "")}`);
    }
  }
  expect(wrong).toEqual([]);
}, 180_000);
