import { expect, test } from "bun:test";
import { onShutdown } from "./shutdown";

function registrar() {
  const handlers: Record<string, (() => void)[]> = {};
  return {
    handlers,
    on: (signal: string, handler: () => void) => {
      (handlers[signal] ??= []).push(handler);
    },
    raise: (signal: string) => handlers[signal]?.forEach((handler) => handler()),
  };
}

test("stops on every signal a terminal can send", () => {
  const signals: string[] = [];
  const fake = registrar();
  onShutdown(
    () => {},
    () => {},
    fake.on,
  );

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    if (fake.handlers[signal]) signals.push(signal);
  }
  expect(signals).toEqual(["SIGINT", "SIGTERM", "SIGHUP"]);
});

test("stops the recording and then leaves", () => {
  const order: string[] = [];
  const fake = registrar();
  onShutdown(
    () => order.push("stop"),
    () => order.push("exit"),
    fake.on,
  );

  fake.raise("SIGINT");

  expect(order).toEqual(["stop", "exit"]);
});

/** Ctrl-C twice, or a SIGTERM landing on the way out, must not kill a recorder started since. */
test("stops once however many signals arrive", () => {
  let stops = 0;
  const fake = registrar();
  onShutdown(
    () => stops++,
    () => {},
    fake.on,
  );

  fake.raise("SIGINT");
  fake.raise("SIGTERM");

  expect(stops).toBe(1);
});

test("still leaves when stopping throws", () => {
  let left = false;
  const fake = registrar();
  onShutdown(
    () => {
      throw new Error("no such process");
    },
    () => {
      left = true;
    },
    fake.on,
  );

  fake.raise("SIGINT");

  expect(left).toBe(true);
});
