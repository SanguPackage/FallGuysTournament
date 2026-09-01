import { readdir, stat } from "node:fs/promises";

export const LOG_NAME = "AppData/LocalLow/Mediatonic/FallGuys_client/Player.log";
export const SHAREX_NAME = "Documents/ShareX/Screenshots";
export const WINDOWS_USERS = "/mnt/c/Users";

export interface Lookup {
  env: Record<string, string | undefined>;
  exists(path: string): Promise<boolean>;
  /** Directory names under the Windows users folder. May throw; the search survives it. */
  users(root: string): Promise<string[]>;
}

export const realLookup: Lookup = {
  env: process.env,
  /** stat rather than Bun.file, which reports a directory as missing. */
  exists: async (path) => {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  },
  users: async (root) =>
    (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
};

/**
 * `/mnt/c/Users` holds junctions ("All Users", "Default User") that error when walked, so the
 * users folder is listed rather than globbed and a failure to read it is not fatal.
 */
async function findUnderUser(
  relative: string,
  override: string | undefined,
  lookup: Lookup,
): Promise<string | undefined> {
  const { env, exists } = lookup;

  for (const path of [override, env.USERPROFILE && `${env.USERPROFILE}/${relative}`]) {
    if (path && (await exists(path))) return path;
  }

  let users: string[];
  try {
    users = await lookup.users(WINDOWS_USERS);
  } catch {
    return undefined;
  }

  for (const user of users) {
    const path = `${WINDOWS_USERS}/${user}/${relative}`;
    if (await exists(path)) return path;
  }

  return undefined;
}

export function findLog(lookup: Lookup = realLookup): Promise<string | undefined> {
  return findUnderUser(LOG_NAME, lookup.env.FALLGUYS_LOG, lookup);
}

export function findScreenshotDir(lookup: Lookup = realLookup): Promise<string | undefined> {
  return findUnderUser(SHAREX_NAME, lookup.env.SHAREX_DIR, lookup);
}
