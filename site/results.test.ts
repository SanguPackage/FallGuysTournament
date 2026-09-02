import { expect, test } from "bun:test";
import type { LiveNow } from "../src/live";
import type { Show } from "../src/types";
import { renderResults } from "./results";

const SOLOS: Show = {
  name: "Solos",
  rounds: [
    { map: "Dizzy Heights", type: "race", first: "Alpha" },
    { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
    { map: "Fall Mountain", type: "final" },
  ],
  winners: ["Alpha"],
};

test("nothing played yet renders a message", () => {
  expect(renderResults([])).toContain("No shows played yet");
});

test("shows are listed newest first", () => {
  const html = renderResults([SOLOS, { name: "Roll Call", rounds: [] }]);
  expect(html.indexOf("Roll Call")).toBeLessThan(html.indexOf("Solos"));
});

test("a show numbers its rounds and names each map", () => {
  const html = renderResults([SOLOS]);
  expect(html).toContain("Dizzy Heights");
  expect(html).toContain("Roll Out");
  expect(html).toContain("Fall Mountain");
});

test("a race names who crossed first", () => {
  expect(renderResults([SOLOS])).toMatch(/Dizzy Heights[\s\S]*?Alpha/);
});

test("a round that scores nothing says so", () => {
  expect(renderResults([SOLOS])).toMatch(/Roll Out[\s\S]*?no points/);
});

test("a race still waiting for its winner is not mistaken for a round that scores nothing", () => {
  const html = renderResults([{ name: "S", rounds: [{ map: "Whirlygig", type: "race" }] }]);
  expect(html).toContain("not recorded");
  expect(html).not.toContain("no points");
});

test("the finalists are listed", () => {
  expect(renderResults([SOLOS])).toContain("Alpha, Bravo");
});

test("a finished show is crowned with its winners", () => {
  expect(renderResults([{ ...SOLOS, winners: ["Alpha", "Bravo"] }])).toContain("Alpha &amp; Bravo");
});

test("the show still being played is marked as live rather than crowned", () => {
  const html = renderResults([{ name: "Roll Call", rounds: [{ map: "See Saw", type: "race", first: "Alpha" }] }]);
  expect(html).toContain("Playing now");
  expect(html).toContain(`class="show live"`);
});

test("only the newest show can be live", () => {
  const html = renderResults([SOLOS, { name: "Roll Call", rounds: [] }]);
  expect([...html.matchAll(/class="show live"/g)]).toHaveLength(1);
});

test("map names are escaped", () => {
  const html = renderResults([{ name: "<b>", rounds: [{ map: "A&B", type: "race" }] }]);
  expect(html).not.toContain("<b>");
  expect(html).toContain("A&amp;B");
});

const NOW: LiveNow = {
  show: "Solos 2",
  showNumber: 2,
  round: 3,
  map: "Roll Out",
  type: "race",
  startedAt: "01:27:40",
};

test("the round on screen is listed before anything recorded", () => {
  const html = renderResults([SOLOS], NOW);
  expect(html).toContain("Playing now");
  expect(html).toContain("Roll Out");
  expect(html.indexOf("Solos 2")).toBeLessThan(html.indexOf("Solos<"));
});

test("a show already typed in is not shown twice", () => {
  const html = renderResults([SOLOS], { ...NOW, showNumber: 1 });
  expect(html).not.toContain("Playing now");
});

test("the log alone is enough to list the show being played", () => {
  expect(renderResults([], NOW)).toContain("Roll Out");
});

test("between rounds the show is still listed", () => {
  const html = renderResults([SOLOS], { ...NOW, map: null, type: null });
  expect(html).toContain("Playing now");
  expect(html).toContain("Loading the next round");
});
