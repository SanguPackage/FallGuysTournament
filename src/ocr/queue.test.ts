import { expect, test } from "bun:test";
import { ReadQueue, type QueueEvent } from "./queue";

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

test("a forgotten capture is read again when it is next offered", async () => {
  let reads = 0;
  const queue = new ReadQueue(async () => {
    reads += 1;
    return { tokens: [`read ${reads}`] };
  });

  queue.offer([{ key: "a", path: "a.jpg" }]);
  await queue.drained();
  // Offering it again is normally free: the admin polls every few seconds.
  queue.offer([{ key: "a", path: "a.jpg" }]);
  await queue.drained();
  expect(reads).toBe(1);

  queue.forget(["a"]);
  queue.offer([{ key: "a", path: "a.jpg" }]);
  await queue.drained();
  expect(reads).toBe(2);
  expect(queue.cache()["a"]).toEqual({ tokens: ["read 2"] });
});

test("the queue says how much work it just took on", async () => {
  const events: QueueEvent[] = [];
  const queue = new ReadQueue(
    async () => ({ tokens: [] }),
    (event) => events.push(event),
  );
  queue.offer([
    { key: "a@1", path: "a.jpg" },
    { key: "b@1", path: "b.jpg" },
  ]);
  await queue.drained();
  expect(events.filter((event) => event.kind === "queued")).toEqual([{ kind: "queued", waiting: 2 }]);
});

test("each capture reports its place in the queue, so a long wait is legible", async () => {
  const events: QueueEvent[] = [];
  const queue = new ReadQueue(
    async () => ({ tokens: [] }),
    (event) => events.push(event),
  );
  queue.offer([
    { key: "a@1", path: "a.jpg" },
    { key: "b@1", path: "b.jpg" },
  ]);
  await queue.drained();
  expect(events.flatMap((event) => (event.kind === "reading" ? [`${event.at}/${event.of}`] : []))).toEqual([
    "1/2",
    "2/2",
  ]);
});

test("draining is reported once, with what it cost", async () => {
  const events: QueueEvent[] = [];
  const queue = new ReadQueue(
    async () => ({ tokens: [] }),
    (event) => events.push(event),
  );
  queue.offer([{ key: "a@1", path: "a.jpg" }]);
  await queue.drained();
  const drained = events.filter((event) => event.kind === "drained");
  expect(drained).toHaveLength(1);
  expect(drained[0]).toMatchObject({ read: 1 });
});

test("a queue nobody is watching still reads", async () => {
  const queue = new ReadQueue(async () => ({ tokens: ["ok"] }));
  queue.offer([{ key: "a@1", path: "a.jpg" }]);
  await queue.drained();
  expect(queue.cache()["a@1"]).toEqual({ tokens: ["ok"] });
});
