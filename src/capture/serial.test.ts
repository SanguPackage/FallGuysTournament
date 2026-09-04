import { expect, test } from "bun:test";
import { Serial } from "./serial";

test("jobs run one at a time, in the order they were added", async () => {
  const order: string[] = [];
  let running = 0;
  const serial = new Serial();
  const job = (name: string) => async () => {
    running += 1;
    expect(running).toBe(1);
    await Bun.sleep(1);
    order.push(name);
    running -= 1;
  };
  serial.add("a", job("a"));
  serial.add("b", job("b"));
  await serial.drained();
  expect(order).toEqual(["a", "b"]);
});

test("a job that throws does not stop the next", async () => {
  const done: string[] = [];
  const serial = new Serial();
  serial.add("boom", async () => {
    throw new Error("nope");
  });
  serial.add("after", async () => {
    done.push("after");
  });
  await serial.drained();
  expect(done).toEqual(["after"]);
});

test("adding to an idle queue starts it again", async () => {
  const serial = new Serial();
  let ran = 0;
  serial.add("a", async () => {
    ran += 1;
  });
  await serial.drained();
  serial.add("a", async () => {
    ran += 1;
  });
  await serial.drained();
  expect(ran).toBe(2);
});

test("a key already waiting is not queued twice", async () => {
  const serial = new Serial();
  let ran = 0;
  const job = async () => {
    await Bun.sleep(1);
    ran += 1;
  };
  serial.add("blocker", job);
  serial.add("a", job);
  serial.add("a", job);
  await serial.drained();
  expect(ran).toBe(2);
});

test("a key still running is not queued behind itself", async () => {
  const serial = new Serial();
  let ran = 0;
  const job = async () => {
    await Bun.sleep(1);
    ran += 1;
  };
  serial.add("a", job);
  serial.add("a", job);
  await serial.drained();
  expect(ran).toBe(1);
});

test("a key that has finished can be queued again", async () => {
  const serial = new Serial();
  let ran = 0;
  const job = async () => {
    ran += 1;
  };
  serial.add("a", job);
  await serial.drained();
  serial.add("a", job);
  await serial.drained();
  expect(ran).toBe(2);
});

test("the moment stamped latest runs first, so a live round never waits on an old failure", async () => {
  const order: string[] = [];
  const serial = new Serial();
  const job = (name: string) => async () => {
    await Bun.sleep(1);
    order.push(name);
  };
  serial.add("blocker", job("blocker"), 100);
  serial.add("old", job("old"), 1);
  serial.add("new", job("new"), 3);
  serial.add("middle", job("middle"), 2);
  await serial.drained();
  expect(order).toEqual(["blocker", "new", "middle", "old"]);
});

test("a job queued without a stamp waits behind every stamped one", async () => {
  const order: string[] = [];
  const serial = new Serial();
  const job = (name: string) => async () => {
    await Bun.sleep(1);
    order.push(name);
  };
  serial.add("blocker", job("blocker"), 100);
  serial.add("unstamped", job("unstamped"));
  serial.add("stamped", job("stamped"), 1);
  await serial.drained();
  expect(order).toEqual(["blocker", "stamped", "unstamped"]);
});
