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
  serial.add(job("a"));
  serial.add(job("b"));
  await serial.drained();
  expect(order).toEqual(["a", "b"]);
});

test("a job that throws does not stop the next", async () => {
  const done: string[] = [];
  const serial = new Serial();
  serial.add(async () => {
    throw new Error("nope");
  });
  serial.add(async () => {
    done.push("after");
  });
  await serial.drained();
  expect(done).toEqual(["after"]);
});

test("adding to an idle queue starts it again", async () => {
  const serial = new Serial();
  let ran = 0;
  serial.add(async () => {
    ran += 1;
  });
  await serial.drained();
  serial.add(async () => {
    ran += 1;
  });
  await serial.drained();
  expect(ran).toBe(2);
});
