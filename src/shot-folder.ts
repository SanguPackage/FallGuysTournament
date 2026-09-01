import { readdir, stat } from "node:fs/promises";
import type { Shot } from "./screenshots";

const IMAGES = /\.(png|jpe?g)$/i;

/** ShareX files captures by month, so `month` is the `YYYY-MM` folder the event falls in. */
export async function listShots(root: string, month: string): Promise<Shot[]> {
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
    if (info.isFile()) shots.push({ file: `${month}/${name}`, takenAt: info.mtimeMs });
  }

  return shots;
}
