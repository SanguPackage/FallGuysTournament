import { expect, test } from "bun:test";
import { publish, type Git } from "./publish";

function git(overrides: Partial<Git> = {}): { git: Git; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    git: {
      staged: async (paths) => (calls.push(["staged", ...paths]), true),
      add: async (paths) => void calls.push(["add", ...paths]),
      commit: async (message, paths) => void calls.push(["commit", message, ...paths]),
      remotes: async () => "origin",
      push: async () => void calls.push(["push"]),
      ...overrides,
    },
  };
}

test("nothing to commit is reported rather than treated as a failure", async () => {
  const { git: g, calls } = git({ staged: async () => false });
  const result = await publish("data: record Solos", g);
  expect(result).toEqual({ committed: false, pushed: false, message: "Nothing to commit." });
  expect(calls).toEqual([["add", "data"]]);
  expect(calls).not.toContainEqual(expect.arrayContaining(["commit"]));
});

test("a change is committed and pushed", async () => {
  const { git: g, calls } = git();
  const result = await publish("data: record Solos", g);
  expect(result).toEqual({ committed: true, pushed: true, message: "Committed and pushed." });
  expect(calls).toEqual([
    ["add", "data"],
    ["staged", "data"],
    ["commit", "data: record Solos", "data"],
    ["push"],
  ]);
});

test("only data is staged and committed, so unrelated staged work is left alone", async () => {
  const { git: g, calls } = git();
  await publish("data: record Solos", g);
  for (const call of calls) {
    expect(call.slice(1).filter((arg) => arg !== "data: record Solos")).toEqual(
      call[0] === "push" ? [] : ["data"],
    );
  }
});

test("with no remote the commit still stands", async () => {
  const { git: g, calls } = git({ remotes: async () => "" });
  const result = await publish("data: record Solos", g);
  expect(result.committed).toBe(true);
  expect(result.pushed).toBe(false);
  expect(result.message).toContain("no git remote");
  expect(calls).not.toContainEqual(["push"]);
});

test("a failed push leaves the commit in place and says to push by hand", async () => {
  const { git: g } = git({
    push: async () => {
      throw new Error("no connection");
    },
  });
  const result = await publish("data: record Solos", g);
  expect(result.committed).toBe(true);
  expect(result.pushed).toBe(false);
  expect(result.message).toContain("Push manually");
});

test("a message is required, so the history never gets an empty subject", async () => {
  const { git: g, calls } = git();
  expect(publish("  ", g)).rejects.toThrow("message");
  expect(calls).toEqual([]);
});
