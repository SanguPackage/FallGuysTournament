import { readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { showDirsFor } from "./capture/layout";
import type { Shot, ShotSource } from "./screenshots";

const IMAGES = /\.(png|jpe?g)$/i;

/** ShareX files captures by month, so `month` is the `YYYY-MM` folder the event falls in. */
export async function listShots(
  root: string,
  month: string,
  source: ShotSource = "sharex",
): Promise<Shot[]> {
  const dir = `${root}/${month}`;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const shots: Shot[] = [];
  for (const name of names) {
    if (!IMAGES.test(name)) continue;
    const info = await stat(`${dir}/${name}`);
    if (info.isFile()) shots.push({ file: `${month}/${name}`, takenAt: info.mtimeMs, source });
  }

  return shots;
}

/**
 * Where a capture the admin asked for lives, or nothing if the name walks out of the folder.
 * Compared with `relative` rather than a prefix: on Windows `resolve` yields backslashes, so a
 * `root + "/"` prefix test rejects every real path.
 */
export function resolveShot(root: string, file: string): string | undefined {
  const path = resolve(root, file);
  const step = relative(resolve(root), path);
  if (!step || step === ".." || step.startsWith(`..${sep}`) || isAbsolute(step)) return undefined;
  return path;
}

/**
 * The frames cut from the recording, which are filed under the show they came from rather than by
 * month. Placement still reads `takenAt`: the round in a file's name is for a human browsing the
 * folder, not for the admin.
 */
export async function listShowShots(root: string, date: string): Promise<Shot[]> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }

  const shots: Shot[] = [];
  for (const folder of showDirsFor(names, date)) {
    for (const name of await readdir(`${root}/${folder}`).catch(() => [])) {
      if (!IMAGES.test(name)) continue;
      const info = await stat(`${root}/${folder}/${name}`);
      if (info.isFile()) {
        shots.push({ file: `${folder}/${name}`, takenAt: info.mtimeMs, source: "auto" });
      }
    }
  }

  return shots;
}
