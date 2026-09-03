import { expect, test } from "bun:test";
import { BEAN_COLOURS, beanColour, beanColours, beanSvg } from "./bean";

test("a player keeps the same bean colour across calls", () => {
  expect(beanColour("Alpha")).toBe(beanColour("Alpha"));
});

test("every colour comes from the palette", () => {
  for (const name of ["Alpha", "Bravo", "", "ǹamé", "x".repeat(200)]) {
    expect(BEAN_COLOURS).toContain(beanColour(name));
  }
});

test("the palette is spread over, not stuck on one colour", () => {
  const names = Array.from({ length: 60 }, (_, i) => `player${i}`);
  const used = new Set(names.map(beanColour));
  expect(used.size).toBeGreaterThan(BEAN_COLOURS.length / 2);
});

test("a bean is drawn in the colour it is given", () => {
  expect(beanSvg(beanColour("Alpha"))).toContain(beanColour("Alpha"));
});

test("beans standing together never share a colour", () => {
  for (let seed = 0; seed < 200; seed++) {
    const trio = [`a${seed}`, `b${seed}`, `c${seed}`];
    expect(new Set(beanColours(trio)).size).toBe(3);
  }
});

test("the first bean keeps the colour its name alone would give it", () => {
  expect(beanColours(["Alpha", "Bravo"])[0]).toBe(beanColour("Alpha"));
});

test("more beans than colours falls back to repeating rather than running out", () => {
  const names = Array.from({ length: BEAN_COLOURS.length + 3 }, (_, i) => `p${i}`);
  const colours = beanColours(names);
  expect(colours).toHaveLength(names.length);
  for (const colour of colours) expect(BEAN_COLOURS).toContain(colour);
});
