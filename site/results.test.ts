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

test("a round leads with the game's icon for its map", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toContain(`<span class="map"><img class="mapicon" src="./img/levels/dizzy-heights-icon.png"`);
});

test("a map with clips on sangu.be links out to them beside its name", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toContain(`Dizzy Heights<a class="sangu" href="https://sangu.be/fallguys/levels/dizzy-heights"`);
});

test("a map sangu.be has no page for keeps its name and gains no link", () => {
  const show: Show = { name: "Solos", rounds: [{ map: "Starchart", type: "race" }] };
  const html = renderResults([show], ROSTER);
  expect(html).toContain("Starchart");
  expect(html).not.toContain("sangu");
});

test("a race names who crossed first on the badge, not in the round line", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toMatch(
    /Dizzy Heights[\s\S]*?<button type="button" class="bn open-player playing first" data-player="Alpha_FOM">⚡ <b>Alpha<\/b>/,
  );
  expect(html).toMatch(/Dizzy Heights[\s\S]*?<span class="winner none"><\/span>/);
});

test("a round nobody can win says nothing about a winner", () => {
  expect(renderResults([SOLOS], ROSTER)).toMatch(/Roll Out[\s\S]*?<span class="winner none"><\/span>/);
});

test("a race still waiting for its winner is not mistaken for a round nobody can win", () => {
  const html = renderResults([{ name: "S", rounds: [{ map: "Whirlygig", type: "race" }] }], ROSTER);
  expect(html).toContain("not recorded");
  expect(html).not.toContain(`<span class="winner none"></span>`);
});

test("a show panel colours each round's badges", () => {
  const html = renderResults([{ ...SOLOS, winners: ["Alpha", "Bravo"] }], ROSTER);
  expect(html).toContain(`class="bn open-player playing"`);
  expect(html).toContain(`class="bn open-player through"`);
  expect(html).toContain(`class="bn open-player out"`);
  expect(html).toContain(`class="bn open-player won"`);
});

test("a decided final counts winners rather than survivors", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toMatch(/Fall Mountain[\s\S]*?1 winner/);
  expect(html).not.toMatch(/Fall Mountain[\s\S]*?\d+ through/);
});

test("a final more than one player won says so in the plural", () => {
  const html = renderResults([{ ...SOLOS, winners: ["Alpha", "Bravo"] }], ROSTER);
  expect(html).toMatch(/Fall Mountain[\s\S]*?2 winners/);
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

test("a log counting past the last show recorded folds into it rather than doubling it", () => {
  const html = renderResults([SOLOS], ROSTER, {
    ...NOW,
    showNumber: 2,
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: 14 },
      { map: "Roll Out", type: "survival", qualified: 2 },
      { map: "Fall Mountain", type: "final" },
    ],
  });
  expect([...html.matchAll(/Dizzy Heights/g)]).toHaveLength(1);
  expect(html).not.toContain("Playing now");
});

test("a show whose maps diverge from the last one recorded is a new panel", () => {
  const html = renderResults([SOLOS], ROSTER, {
    ...NOW,
    showNumber: 2,
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: 14 },
      { map: "Hoverboard Heroes", type: "survival" },
    ],
  });
  expect([...html.matchAll(/Dizzy Heights/g)]).toHaveLength(2);
  expect(html).toContain("Playing now");
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

test("the log alone is enough to list the show being played", () => {
  const html = renderResults([], ROSTER, NOW);
  expect(html).toContain("Roll Out");
  expect(html).toContain("Playing now");
});

test("nothing has been read for the show being played, so its field is still grey", () => {
  const html = renderResults([], ROSTER, NOW);
  // Three rounds, each greying the whole roster, because no board has been read for any of them.
  expect([...html.matchAll(/class="bn open-player playing"/g)]).toHaveLength(ROSTER.length * NOW.rounds.length);
});

test("between rounds the rounds already loaded are still listed", () => {
  const html = renderResults([SOLOS], ROSTER, { ...NOW, map: null, type: null });
  expect(html).toContain("Playing now");
  expect(html).toContain("Wall Guys");
  expect(html).not.toContain("on screen");
});

test("a show with nothing loaded at all says it is waiting", () => {
  const html = renderResults([], ROSTER, {
    ...NOW,
    showNumber: 1,
    map: null,
    type: null,
    rounds: [],
  });
  expect(html).toContain("Loading the next round");
});

test("a first typed into the live show shows up next to its round", () => {
  const typed: Show = {
    name: "Solos 2",
    rounds: [{ map: "Wall Guys", type: "race", first: "Alpha", qualified: ["Alpha", "Bravo"] }],
  };
  const html = renderResults([SOLOS, typed], ROSTER, NOW);
  expect(html).toMatch(/Wall Guys[\s\S]*?Alpha/);
  expect(html).not.toMatch(/Wall Guys[\s\S]*?first not recorded/);
});

test("a round the log has loaded but nobody typed still appears on the live show", () => {
  const typed: Show = { name: "Solos 2", rounds: [{ map: "Wall Guys", type: "race" }] };
  expect(renderResults([SOLOS, typed], ROSTER, NOW)).toContain("Hoverboard Heroes");
});

test("the live show is drawn once, not once per source", () => {
  const typed: Show = { name: "Solos 2", rounds: [{ map: "Wall Guys", type: "race" }] };
  const html = renderResults([SOLOS, typed], ROSTER, NOW);
  expect([...html.matchAll(/Solos 2/g)]).toHaveLength(1);
});

test("a round reds the players it knocked out", () => {
  const html = renderResults([SOLOS], ROSTER);
  // Charlie is on nobody's board, so Roll Out is where the roster lost them.
  expect(html).toMatch(/Roll Out[\s\S]*?bn open-player out[\s\S]*?Charlie/);
});

test("the final badges nobody when one player won it", () => {
  const html = renderResults([SOLOS], ROSTER);
  expect(html).toMatch(/Fall Mountain[\s\S]*?👑 Alpha/);
  expect(html).not.toMatch(/Fall Mountain[\s\S]*?bn /);
});

test("a shared win badges both winners, so the tie is visible", () => {
  const html = renderResults([{ ...SOLOS, winners: ["Alpha", "Bravo"] }], ROSTER);
  expect(html).toMatch(/Fall Mountain[\s\S]*?bn open-player won[\s\S]*?Alpha/);
  expect(html).toMatch(/Fall Mountain[\s\S]*?bn open-player won[\s\S]*?Bravo/);
});

test("a show no longer carries one field under all its rounds", () => {
  const html = renderResults([{ ...SOLOS, winners: ["Alpha", "Bravo"] }], ROSTER);
  expect([...html.matchAll(/class="beans"/g)]).toHaveLength(SOLOS.rounds.length);
});
