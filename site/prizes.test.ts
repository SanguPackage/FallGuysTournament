import { expect, test } from "bun:test";
import type { Prize } from "../src/types";
import { renderPrizes } from "./prizes";

const PRIZES: Prize[] = [
  { place: 1, name: "NH-D15 G2", image: "nh-d15-g2.png" },
  { place: 2, name: "NH-U12A chromax.black", image: "nh-u12a-chromax-black.png" },
  { place: 3, name: "NH-D12L", image: "nh-d12l.png" },
];

test("every prize gets a step of the podium", () => {
  const html = renderPrizes(PRIZES);
  expect(html).toContain("NH-D15 G2");
  expect(html).toContain("NH-U12A chromax.black");
  expect(html).toContain("NH-D12L");
});

test("the winner's step stands in the middle, so the tallest block is centred", () => {
  const html = renderPrizes(PRIZES);
  expect(html.indexOf("p p2")).toBeLessThan(html.indexOf("p p1"));
  expect(html.indexOf("p p1")).toBeLessThan(html.indexOf("p p3"));
});

test("a picture of the prize stands where the dashboard draws a bean", () => {
  const html = renderPrizes(PRIZES);
  expect(html).toContain(`src="./img/prizes/nh-d15-g2.png"`);
  expect(html).toContain(`alt="NH-D15 G2"`);
  expect(html).not.toContain("class=\"bean\"");
});

test("only the first place is crowned", () => {
  expect([...renderPrizes(PRIZES).matchAll(/class="crown"/g)]).toHaveLength(1);
});

test("each step says which place it is", () => {
  const html = renderPrizes(PRIZES);
  expect(html).toContain("1st");
  expect(html).toContain("2nd");
  expect(html).toContain("3rd");
  expect(html).toContain("🥇");
});

test("a place with no prize leaves no empty step", () => {
  const html = renderPrizes(PRIZES.slice(0, 2));
  expect(html).toContain("p p1");
  expect(html).not.toContain("p p3");
});

test("nothing is drawn for an event with no prizes", () => {
  expect(renderPrizes([])).toBe("");
});

test("a prize name is escaped", () => {
  expect(renderPrizes([{ place: 1, name: "<b>", image: "x.png" }])).not.toContain("<b>");
});
