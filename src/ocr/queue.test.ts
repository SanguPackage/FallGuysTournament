import { expect, test } from "bun:test";
import { ReadQueue } from "./queue";

test("each capture is read once, however often it is offered", async () => {
  let calls = 0;
  const queue = new ReadQueue(async () => {
    calls += 1;
    return { tokens: [] };
  });
  queue.offer([
    { key: "a@1", path: "a.jpg" },
    { key: "a@1", path: "a.jpg" },
  ]);
  queue.offer([{ key: "a@1", path: "a.jpg" }]);
  await queue.drained();
  expect(calls).toBe(1);
});

test("reads land in the cache under their key", async () => {
  const queue = new ReadQueue(async () => ({ screen: "winner" as const, tokens: ["Diego"] }));
  queue.offer([{ key: "w@2", path: "w.jpg" }]);
  await queue.drained();
  expect(queue.cache()["w@2"]).toEqual({ screen: "winner", tokens: ["Diego"] });
});

test("one capture failing does not stop the next", async () => {
  const queue = new ReadQueue(async (path) => {
    if (path === "bad.jpg") throw new Error("unreadable");
    return { tokens: ["ok"] };
  });
  queue.offer([
    { key: "bad@1", path: "bad.jpg" },
    { key: "good@1", path: "good.jpg" },
  ]);
  await queue.drained();
  expect(queue.cache()["good@1"]).toEqual({ tokens: ["ok"] });
  expect(queue.cache()["bad@1"]).toEqual({ tokens: [] });
});
