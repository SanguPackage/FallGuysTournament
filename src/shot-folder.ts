import { readdir, stat } from "node:fs/promises";
import type { Shot } from "./screenshots";

const IMAGES = /\.(png|jpe?g)$/i;

export async function listShots(dir: string): Promise<Shot[]> {
  const names = await readdir(dir, { recursive: true });
  const shots: Shot[] = [];

  for (const name of names) {
    if (!IMAGES.test(name)) continue;
    const info = await stat(`${dir}/${name}`);
    if (info.isFile()) shots.push({ file: name.replaceAll("\\", "/"), takenAt: info.mtimeMs });
  }

  return shots;
}
