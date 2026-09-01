import { readdir } from "node:fs/promises";

export const LOG_NAME = "AppData/LocalLow/Mediatonic/FallGuys_client/Player.log";
export const WINDOWS_USERS = "/mnt/c/Users";

export interface LogLookup {
  env: Record<string, string | undefined>;
  exists(path: string): Promise<boolean>;
  /** Directory names under the Windows users folder. May throw; the search survives it. */
  users(root: string): Promise<string[]>;
}

export const realLookup: LogLookup = {
  env: process.env,
  exists: (path) => Bun.file(path).exists(),
  users: async (root) =>
    (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
};

/**
 * `/mnt/c/Users` holds junctions ("All Users", "Default User") that error when walked, so the
 * users folder is listed rather than globbed and a failure to read it is not fatal.
 */
export async function findLog(lookup: LogLookup = realLookup): Promise<string | undefined> {
  const { env, exists } = lookup;

  for (const path of [env.FALLGUYS_LOG, env.USERPROFILE && `${env.USERPROFILE}/${LOG_NAME}`]) {
    if (path && (await exists(path))) return path;
  }

  let users: string[];
  try {
    users = await lookup.users(WINDOWS_USERS);
  } catch {
    return undefined;
  }

  for (const user of users) {
    const path = `${WINDOWS_USERS}/${user}/${LOG_NAME}`;
    if (await exists(path)) return path;
  }

  return undefined;
}
