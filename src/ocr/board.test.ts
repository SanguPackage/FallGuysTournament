import { afterAll, expect, test } from "bun:test";
import { assign } from "./match";
import { closeReader, readShot } from "./read";

afterAll(async () => {
  await closeReader();
});

/**
 * The boards read end to end, against the names `fixtures/manifest.json` holds for them. Every
 * player on a board is registered, so its own names are the roster the matcher would really be
 * given, and every name short of the full count is one the admin has to type by hand.
 */
const ROOT = `${import.meta.dir}/../../fixtures`;
const manifest = (await Bun.file(`${ROOT}/manifest.json`).json()) as {
  files: Record<string, { names?: string[] }>;
};

for (const [path, want] of Object.entries(manifest.files)) {
  if (!want.names) continue;

  test(`${path}: every name lands on its player`, async () => {
    const read = await readShot(`${ROOT}/${path}`);
    const settled = assign(read.tokens, want.names!).map((a) => a.value);

    expect(read.tokens.length).toBe(want.names!.length);
    expect(
      want.names!.flatMap((name, i) =>
        settled[i] === name ? [] : [`${name}: read ${JSON.stringify(read.tokens[i] ?? "")}`],
      ),
    ).toEqual([]);
  }, 120_000);
}
