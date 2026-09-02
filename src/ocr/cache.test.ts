import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheKey, loadCache, saveCache } from "./cache";

test("a cache survives a round trip through disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ocr-"));
  const path = join(dir, "reads.json");
  await saveCache(path, { "a.jpg@5": { screen: "winner", tokens: ["Diego_9942"] } });
  expect(await loadCache(path)).toEqual({
    "a.jpg@5": { screen: "winner", tokens: ["Diego_9942"] },
  });
  await rm(dir, { recursive: true, force: true });
});

test("a missing cache reads as empty rather than throwing", async () => {
  expect(await loadCache(join(tmpdir(), "nope", "reads.json"))).toEqual({});
});

test("a rewritten capture gets a new key", () => {
  expect(cacheKey("a.jpg", 5)).not.toBe(cacheKey("a.jpg", 6));
});
