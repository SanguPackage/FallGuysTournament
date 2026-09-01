import { expect, test } from "bun:test";
import { renderShows } from "./shows";
import type { Show } from "../src/types";

const fallBall: Show = {
  name: "Fall Ball",
  rounds: [
    { map: "Whirlygig", type: "race", first: "oopman" },
    { map: "Hex-A-Gone", type: "survival" },
    { map: "Fall Ball", type: "final" },
  ],
  finalists: ["oopman", "nicksonn", "f1xel"],
  winners: ["oopman"],
};

test("a show with no rounds yet renders a message", () => {
  expect(renderShows([])).toContain("No shows played yet");
});

test("shows are numbered and named", () => {
  const html = renderShows([fallBall]);
  expect(html).toContain("Show 1");
  expect(html).toContain("Fall Ball");
});

test("a race round names whoever crossed first", () => {
  const html = renderShows([fallBall]);
  expect(html).toContain("Whirlygig");
  expect(html).toContain("oopman");
});

test("a race round still awaiting a name says so", () => {
  const html = renderShows([
    { name: "S", rounds: [{ map: "Whirlygig", type: "race" }] },
  ]);
  expect(html).toContain("not recorded");
});

test("finalists and winners are listed", () => {
  const html = renderShows([fallBall]);
  expect(html).toContain("nicksonn");
  expect(html).toContain("f1xel");
  expect(html).toMatch(/Winner<\/dt>/);
});

test("more than one winner reads as a shared win", () => {
  const html = renderShows([{ ...fallBall, winners: ["oopman", "f1xel"] }]);
  expect(html).toMatch(/Winners<\/dt>/);
});

test("a show still in progress omits the final", () => {
  const html = renderShows([{ name: "S", rounds: [{ map: "Whirlygig", type: "race" }] }]);
  expect(html).not.toContain("Finalists");
});

test("names are escaped", () => {
  const html = renderShows([{ name: "<b>", rounds: [] }]);
  expect(html).not.toContain("<b>");
});
