import { expect, test } from "bun:test";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { listShots } from "./shot-folder";

const TAKEN = new Date("2026-09-01T20:25:20");

test("the folder is read down into its month subfolders, images only", async () => {
  const dir = await mkdtemp(`${tmpdir()}/shots-`);
  await mkdir(`${dir}/2026-09`);
  await writeFile(`${dir}/2026-09/one.png`, "");
  await writeFile(`${dir}/2026-09/notes.txt`, "");
  await utimes(`${dir}/2026-09/one.png`, TAKEN, TAKEN);

  expect(await listShots(dir)).toEqual([
    { file: "2026-09/one.png", takenAt: TAKEN.getTime() },
  ]);
});
