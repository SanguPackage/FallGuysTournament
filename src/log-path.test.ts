import { expect, test } from "bun:test";
import { findLog, LOG_NAME, WINDOWS_USERS, type LogLookup } from "./log-path";

function lookup(present: string[], overrides: Partial<LogLookup> = {}): LogLookup {
  return {
    env: {},
    exists: async (path) => present.includes(path),
    users: async () => ["woute", "Public"],
    ...overrides,
  };
}

test("an explicit FALLGUYS_LOG wins", async () => {
  const found = await findLog(
    lookup(["/somewhere/Player.log"], { env: { FALLGUYS_LOG: "/somewhere/Player.log" } }),
  );
  expect(found).toBe("/somewhere/Player.log");
});

test("FALLGUYS_LOG pointing at nothing falls through rather than failing", async () => {
  const found = await findLog(
    lookup([`${WINDOWS_USERS}/woute/${LOG_NAME}`], { env: { FALLGUYS_LOG: "/gone/Player.log" } }),
  );
  expect(found).toBe(`${WINDOWS_USERS}/woute/${LOG_NAME}`);
});

test("the Windows profile is tried before scanning every user", async () => {
  const found = await findLog(
    lookup([`/mnt/c/Users/woute/${LOG_NAME}`], { env: { USERPROFILE: "/mnt/c/Users/woute" } }),
  );
  expect(found).toBe(`/mnt/c/Users/woute/${LOG_NAME}`);
});

test("otherwise every user on the C: drive is tried", async () => {
  expect(await findLog(lookup([`${WINDOWS_USERS}/woute/${LOG_NAME}`]))).toBe(
    `${WINDOWS_USERS}/woute/${LOG_NAME}`,
  );
});

test("no log anywhere is not an error", async () => {
  expect(await findLog(lookup([]))).toBeUndefined();
});

test("an unreadable Users directory does not stop the search", async () => {
  const found = await findLog(
    lookup([`/mnt/c/Users/woute/${LOG_NAME}`], {
      env: { USERPROFILE: "/mnt/c/Users/woute" },
      users: async () => {
        throw new Error("ENOENT");
      },
    }),
  );
  expect(found).toBe(`/mnt/c/Users/woute/${LOG_NAME}`);
});

test("an unreadable Users directory with nothing else found gives up quietly", async () => {
  const found = await findLog(
    lookup([], {
      users: async () => {
        throw new Error("ENOENT");
      },
    }),
  );
  expect(found).toBeUndefined();
});
