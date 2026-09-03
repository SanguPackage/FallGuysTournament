import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { checkData, checkEvent, checkPlayers } from "./data-check";

const event = {
  name: "FOM 2026",
  date: "2026-09-01",
  shows: [
    {
      name: "Solos",
      rounds: [
        { map: "Wall Guys", type: "race", first: "Alpha", qualified: ["Alpha"] },
        { map: "Fall Mountain", type: "final" },
      ],
      winners: ["Alpha"],
    },
  ],
  penalties: [{ ingame: "Alpha", points: -2, reason: "Left early" }],
};

const players = { players: [{ fom: "Ann", ingame: "Alpha" }, { ingame: "Ref", admin: true }] };

test("a well-formed event and roster report nothing", () => {
  expect(checkEvent(event)).toEqual([]);
  expect(checkPlayers(players)).toEqual([]);
});

test("an event that is not an object at all is caught", () => {
  expect(checkEvent(null)).toEqual(["is not an object"]);
  expect(checkEvent([])).toEqual(["is not an object"]);
});

test("a missing shows array is caught, since the board maps over it", () => {
  expect(checkEvent({ ...event, shows: undefined })).toContain("shows is not an array");
});

test("a round with no map or an unknown type is caught", () => {
  const rounds = [{ type: "race" }, { map: "Tail Tag", type: "brawl" }];
  expect(checkEvent({ ...event, shows: [{ name: "Solos", rounds }] })).toEqual([
    "shows[0].rounds[0].map is not a string",
    'shows[0].rounds[1].type is not a round type: "brawl"',
  ]);
});

test("a first that is not a name is caught, since scoring looks it up", () => {
  const shows = [{ name: "Solos", rounds: [{ map: "Wall Guys", type: "race", first: 7 }] }];
  expect(checkEvent({ ...event, shows })).toEqual(["shows[0].rounds[0].first is not a string"]);
});

test("survivors and winners have to be lists of names", () => {
  const shows = [
    { name: "Solos", rounds: [{ map: "Wall Guys", type: "race", qualified: "Alpha" }], winners: [1] },
  ];
  expect(checkEvent({ ...event, shows })).toEqual([
    "shows[0].winners is not an array of names",
    "shows[0].rounds[0].qualified is not an array of names",
  ]);
});

test("a penalty missing its points is caught, since it is added to a total", () => {
  const penalties = [{ ingame: "Alpha", reason: "Left early" }];
  expect(checkEvent({ ...event, penalties })).toEqual(["penalties[0].points is not a number"]);
});

test("a player with no Fall Guys name is caught, since it is their row on the board", () => {
  expect(checkPlayers({ players: [{ fom: "Ann" }] })).toEqual([
    "players[0].ingame is not a string",
  ]);
});

test("a crown rank typed as text is caught, since the board prints it as a number", () => {
  expect(checkPlayers({ players: [{ ingame: "Alpha", crownRank: "45" }] })).toEqual([
    "players[0].crownRank is not a number",
  ]);
  expect(checkPlayers({ players: [{ ingame: "Alpha", crownRank: 45 }] })).toEqual([]);
});

test("every problem in a file is reported at once, not just the first", () => {
  const broken = { name: 1, date: 2, shows: 3, penalties: 4 };
  expect(checkEvent(broken)).toHaveLength(4);
});

async function fixture(files: Record<string, string>): Promise<string> {
  const path = `${tmpdir()}/fom-check-${Math.random().toString(36).slice(2)}`;
  for (const [name, body] of Object.entries(files)) await Bun.write(`${path}/${name}`, body);
  return path;
}

test("files that parse and hold their shape report nothing", async () => {
  const path = await fixture({
    "event.json": JSON.stringify(event),
    "players.json": JSON.stringify(players),
  });
  expect(await checkData(path)).toEqual([]);
});

test("a file that is not JSON at all is reported against its name", async () => {
  const path = await fixture({
    "event.json": "{ oops",
    "players.json": JSON.stringify(players),
  });
  expect(await checkData(path)).toEqual([{ file: "event.json", problem: "is not valid JSON" }]);
});

test("a file the site needs but cannot find is a problem, not a pass", async () => {
  const path = await fixture({ "players.json": JSON.stringify(players) });
  expect(await checkData(path)).toEqual([{ file: "event.json", problem: "is missing" }]);
});

test("problems are named by the file they came from", async () => {
  const path = await fixture({
    "event.json": JSON.stringify({ ...event, shows: 3 }),
    "players.json": JSON.stringify({ players: [{}] }),
  });
  expect(await checkData(path)).toEqual([
    { file: "event.json", problem: "shows is not an array" },
    { file: "players.json", problem: "players[0].ingame is not a string" },
  ]);
});

test("a checked flag that is not true or false is caught", () => {
  const shows = [{ name: "Solos", rounds: [], checked: "yes" }];
  expect(checkEvent({ ...event, shows })).toEqual(["shows[0].checked is not true or false"]);
});

test("a survivor count that is not a number is caught", () => {
  const shows = [{ name: "Solos", rounds: [{ map: "Wall Guys", type: "race", survivors: "21" }] }];
  expect(checkEvent({ ...event, shows })).toEqual([
    "shows[0].rounds[0].survivors is not a number",
  ]);
});

test("a joined flag that is not true or false is caught", () => {
  const broken = { players: [{ ingame: "Alpha", joined: "yes" }] };
  expect(checkPlayers(broken)).toEqual(["players[0].joined is not true or false"]);
});

test("a lobby code that is not a string is caught", () => {
  expect(checkEvent({ ...event, lobbyCode: 1234 })).toContain("lobbyCode is not a string");
  expect(checkEvent({ ...event, lobbyCode: "ABC123" })).toEqual([]);
});
