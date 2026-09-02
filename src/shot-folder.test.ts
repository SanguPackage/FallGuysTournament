import { expect, test } from "bun:test";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { listShots, resolveShot } from "./shot-folder";

const TAKEN = new Date("2026-09-01T20:25:20");

async function folder(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/shots-`);
  await mkdir(`${dir}/2026-08`);
  await mkdir(`${dir}/2026-09`);
  await writeFile(`${dir}/2026-08/july.png`, "");
  await writeFile(`${dir}/2026-09/one.png`, "");
  await writeFile(`${dir}/2026-09/notes.txt`, "");
  await utimes(`${dir}/2026-09/one.png`, TAKEN, TAKEN);
  return dir;
}

test("only the event's own month is read, images only", async () => {
  expect(await listShots(await folder(), "2026-09")).toEqual([
    { file: "2026-09/one.png", takenAt: TAKEN.getTime(), source: "sharex" },
  ]);
});

test("a listing says which root it came from", async () => {
  expect(await listShots(await folder(), "2026-09", "auto")).toEqual([
    { file: "2026-09/one.png", takenAt: TAKEN.getTime(), source: "auto" },
  ]);
});

test("a month with no folder yet is empty rather than an error", async () => {
  expect(await listShots(await folder(), "2026-10")).toEqual([]);
});

test("a capture inside the folder resolves to its own path", () => {
  expect(resolveShot("/shots", "2026-09/one.png")).toBe(resolve("/shots/2026-09/one.png"));
});

test("a name walking out of the folder resolves to nothing", () => {
  expect(resolveShot("/shots", "../../../etc/passwd")).toBeUndefined();
  expect(resolveShot("/shots", "..")).toBeUndefined();
});

test("an absolute name is not allowed to replace the folder", () => {
  expect(resolveShot("/shots", "/etc/passwd")).toBeUndefined();
});
