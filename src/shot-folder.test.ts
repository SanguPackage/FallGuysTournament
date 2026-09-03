import { expect, test } from "bun:test";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { listShots, listShowShots, resolveShot } from "./shot-folder";

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

async function showFolders(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/shows-`);
  for (const name of [
    "show-2026-09-01T22h10-solos-1",
    "show-2026-09-02T23h25-solos-4",
    "show-2026-09-03T00h29-solos-5",
  ]) {
    await mkdir(`${dir}/${name}`);
  }
  await writeFile(`${dir}/show-2026-09-01T22h10-solos-1/round-01-winner-01.jpg`, "");
  await writeFile(`${dir}/show-2026-09-02T23h25-solos-4/round-01-whole-field-01.jpg`, "");
  await writeFile(`${dir}/show-2026-09-02T23h25-solos-4/transcript.txt`, "");
  await writeFile(`${dir}/show-2026-09-03T00h29-solos-5/2026-09-02-show-05-solos-5.mp4`, "");
  await writeFile(`${dir}/show-2026-09-03T00h29-solos-5/round-02-winner-01.jpg`, "");
  await utimes(`${dir}/show-2026-09-02T23h25-solos-4/round-01-whole-field-01.jpg`, TAKEN, TAKEN);
  return dir;
}

test("only this evening's show folders are read, images only", async () => {
  const shots = await listShowShots(await showFolders(), "2026-09-02");
  expect(shots.map((shot) => shot.file).sort()).toEqual([
    "show-2026-09-02T23h25-solos-4/round-01-whole-field-01.jpg",
    "show-2026-09-03T00h29-solos-5/round-02-winner-01.jpg",
  ]);
  expect(shots.every((shot) => shot.source === "auto")).toBe(true);
});

test("a capture carries the time it was taken, which is what places it", async () => {
  const shots = await listShowShots(await showFolders(), "2026-09-02");
  const field = shots.find((shot) => shot.file.includes("whole-field"))!;
  expect(field.takenAt).toBe(TAKEN.getTime());
});

test("a shows root that does not exist yet is empty rather than an error", async () => {
  expect(await listShowShots("/nowhere/at/all", "2026-09-02")).toEqual([]);
});
