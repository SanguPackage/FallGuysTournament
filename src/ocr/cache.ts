import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ShotRead } from "./read";

export type ReadCache = Record<string, ShotRead>;

/** A capture copied over keeps its name but not its mtime, so both go in the key. */
export function cacheKey(file: string, mtimeMs: number): string {
  return `${file}@${Math.round(mtimeMs)}`;
}

export async function loadCache(path: string): Promise<ReadCache> {
  try {
    return (await Bun.file(path).json()) as ReadCache;
  } catch {
    return {};
  }
}

export async function saveCache(path: string, cache: ReadCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(cache, null, 2)}\n`);
}
