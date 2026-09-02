import { expect, test } from "bun:test";
import type { LiveNow } from "../src/live";
import type { Player, Show } from "../src/types";
import { renderResults } from "./results";

const ROSTER: Player[] = [
  { fom: "Alpha_FOM", ingame: "Alpha" },
  { fom: "Bravo_FOM", ingame: "Bravo" },
  { fom: "Charlie_FOM", ingame: "Charlie" },
];

const SOLOS: Show = {
  name: "Solos",
  rounds: [
    { map: "Dizzy Heights", type: "race", first: "Alpha", survivors: 14 },
    { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"], survivors: 2 },
    { map: "Fall Mountain", type: "final" },
  ],
  winners: ["Alpha"],
};

test("nothing played yet renders a message", () => {
  expect(renderResults([], ROSTER)).toContain("No shows played yet");
});

test("shows are listed newest first", () => {
  const html = renderResults([SOLOS, { name: "Roll Call", rounds: [] }], ROSTER);
  expect(html.indexOf("Roll Call")).toBeLessThan(html.indexOf("Solos"));
});

test("a show numbers its rounds and names each map", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toContain("Dizzy Heights");
  expect(html).toContain("Roll Out");
  expect(html).toContain("Fall Mountain");
});

test("a race names who crossed first", () => {
  expect(renderResults([SOLOS], ROSTER)).toMatch(/Dizzy Heights[\s\S]*?Alpha/);
});

test("a round that scores nothing says so", () => {
  expect(renderResults([SOLOS], ROSTER)).toMatch(/Roll Out[\s\S]*?no points/);
});

test("a race still waiting for its winner is not mistaken for a round that scores nothing", () => {
  const html = renderResults([{ name: "S", rounds: [{ map: "Whirlygig", type: "race" }] }], ROSTER);
  expect(html).toContain("not recorded");
  expect(html).not.toContain("no points");
});

test("a show panel colours the field", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toContain(`class="bn won"`);
  expect(html).toContain(`class="bn through"`);
  expect(html).toContain(`class="bn out"`);
});

test("a finished show is crowned with its winners", () => {
  expect(renderResults([{ ...SOLOS, winners: ["Alpha", "Bravo"] }], ROSTER)).toContain("Alpha &amp; Bravo");
});

test("the show still being played is marked as live rather than crowned", () => {
  const html = renderResults([{ name: "Roll Call", rounds: [{ map: "See Saw", type: "race", first: "Alpha" }] }], ROSTER);
  expect(html).toContain("Playing now");
  expect(html).toContain(`class="show live"`);
});

test("only the newest show can be live", () => {
  const html = renderResults([SOLOS, { name: "Roll Call", rounds: [] }], ROSTER);
  expect([...html.matchAll(/class="show live"/g)]).toHaveLength(1);
});

test("map names are escaped", () => {
  const html = renderResults([{ name: "<b>", rounds: [{ map: "A&B", type: "race" }] }], ROSTER);
  expect(html).toContain("<h3>&lt;b&gt;</h3>");
  expect(html).toContain("A&amp;B");
});

const NOW: LiveNow = {
  show: "Solos 2",
  showNumber: 2,
  round: 3,
  map: "Roll Out",
  type: "race",
  startedAt: "01:27:40",
  rounds: [
    { map: "Wall Guys", type: "race", qualified: 14 },
    { map: "Hoverboard Heroes", type: "survival", qualified: 9 },
    { map: "Roll Out", type: "race" },
  ],
};

test("the round on screen is listed before anything recorded", () => {
  const html = renderResults([SOLOS], ROSTER, NOW);
  expect(html).toContain("Playing now");
  expect(html).toContain("Roll Out");
  expect(html.indexOf("Solos 2")).toBeLessThan(html.indexOf("Solos<"));
});

test("a show already typed in is not shown twice", () => {
  const html = renderResults([SOLOS], ROSTER, { ...NOW, showNumber: 1 });
  expect(html).not.toContain("Playing now");
});

test("the log alone is enough to list the show being played", () => {
  expect(renderResults([], ROSTER, NOW)).toContain("Roll Out");
});

test("between rounds the show is still listed", () => {
  const html = renderResults([SOLOS], ROSTER, { ...NOW, map: null, type: null });
  expect(html).toContain("Playing now");
  expect(html).toContain("Loading the next round");
});

test("the show being played carries the field like every other box", () => {
  const html = renderResults([], ROSTER, NOW);
  // Nothing has been read for it yet, so the whole field is still in.
  expect([...html.matchAll(/class="bn playing"/g)]).toHaveLength(ROSTER.length);
});

test("every round the log has loaded for the show being played is listed", () => {
  const html = renderResults([], ROSTER, NOW);
  expect(html).toContain("Wall Guys");
  expect(html).toContain("Hoverboard Heroes");
  expect(html).toContain("Roll Out");
});

test("a round the log has already counted through says how many got out of it", () => {
  const html = renderResults([], ROSTER, NOW);
  expect(html).toMatch(/Wall Guys[\s\S]*?14 through/);
});

test("the round on screen is marked rather than counted", () => {
  const html = renderResults([], ROSTER, NOW);
  expect(html).toMatch(/Roll Out[\s\S]*?on screen/);
});

test("a recorded round says how many the log counted through it", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toMatch(/Dizzy Heights[\s\S]*?14 through/);
  expect(html).toMatch(/Roll Out[\s\S]*?2 through/);
});

test("a round nobody counted says nothing rather than zero", () => {
  const bare: Show = { name: "S", rounds: [{ map: "Whirlygig", type: "race" }] };
  expect(renderResults([bare], ROSTER)).not.toContain("through");
});
