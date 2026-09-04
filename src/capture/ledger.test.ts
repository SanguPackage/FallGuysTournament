import { expect, test } from "bun:test";
import { Ledger, MAX_ATTEMPTS } from "./ledger";

test("a fresh key is worth trying", () => {
  expect(new Ledger().pending("0:first:0")).toBe(true);
});

test("a key that succeeded is never tried again", () => {
  const ledger = new Ledger();
  ledger.done("0:first:0");
  expect(ledger.pending("0:first:0")).toBe(false);
});

test("a key is retried until it runs out of attempts", () => {
  const ledger = new Ledger();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    expect(ledger.pending("0:winner:-")).toBe(true);
    ledger.failed("0:winner:-");
  }
  expect(ledger.pending("0:winner:-")).toBe(false);
});

test("what a ledger knows survives being written out and read back", () => {
  const ledger = new Ledger();
  ledger.done("0:first:0");
  ledger.failed("0:first:1");
  const reloaded = new Ledger(JSON.parse(JSON.stringify(ledger.state())));
  expect(reloaded.pending("0:first:0")).toBe(false);
  expect(reloaded.pending("0:first:1")).toBe(true);
});

test("a moment whose footage was searched and held nothing is never tried again", () => {
  const ledger = new Ledger();
  ledger.exhausted("0:first:2");
  expect(ledger.pending("0:first:2")).toBe(false);
});

test("giving up survives being written out and read back", () => {
  const ledger = new Ledger();
  ledger.exhausted("0:first:2");
  const reloaded = new Ledger(JSON.parse(JSON.stringify(ledger.state())));
  expect(reloaded.pending("0:first:2")).toBe(false);
});
