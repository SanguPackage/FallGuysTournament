import { expect, test } from "bun:test";
import { CONFETTI_COLOURS, confettiHtml } from "./confetti";

function props(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`--${name}:([^;"]+)`, "g"))].map((m) => m[1]!);
}

test("the same confetti is drawn on every repaint", () => {
  expect(confettiHtml()).toBe(confettiHtml());
});

test("a speck count of its own is honoured", () => {
  expect([...confettiHtml(7).matchAll(/<i /g)]).toHaveLength(7);
});

test("every speck is one of the tournament colours", () => {
  for (const colour of props(confettiHtml(), "c")) expect(CONFETTI_COLOURS).toContain(colour);
});

test("specks fall across the whole width, not down one line", () => {
  const left = props(confettiHtml(), "x").map(parseFloat);
  expect(Math.min(...left)).toBeLessThan(20);
  expect(Math.max(...left)).toBeGreaterThan(80);
});

test("no two pieces share a delay, so the fall never lands as a curtain", () => {
  const delays = props(confettiHtml(), "delay");
  expect(new Set(delays).size).toBe(delays.length);
});

test("specks drift both ways", () => {
  const sway = props(confettiHtml(), "sway").map(parseFloat);
  expect(Math.min(...sway)).toBeLessThan(0);
  expect(Math.max(...sway)).toBeGreaterThan(0);
});
