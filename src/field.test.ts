import { expect, test } from "bun:test";
import { aliveInto, fieldOf, roundFieldsOf } from "./field";
import type { Player, Show } from "./types";

const ROSTER: Player[] = [
  { fom: "Alpha_FOM", ingame: "Alpha" },
  { fom: "Bravo_FOM", ingame: "Bravo" },
  { fom: "Charlie_FOM", ingame: "Charlie" },
  { fom: "Delta_FOM", ingame: "Delta" },
  { fom: "Ref_FOM", ingame: "Ref", admin: true },
  { fom: "NoShow_FOM", ingame: "NoShow", joined: false },
  { fom: "Unreported_FOM" },
];

function states(show: Show): Record<string, string> {
  return Object.fromEntries(fieldOf(show, ROSTER).map((p) => [p.ingame, p.state]));
}

test("a show with nothing read yet leaves everyone in play", () => {
  const show: Show = { name: "Solos", rounds: [{ map: "Dizzy Heights", type: "race" }] };
  expect(states(show)).toEqual({
    Alpha: "playing",
    Bravo: "playing",
    Charlie: "playing",
    Delta: "playing",
  });
});

test("a show that has not loaded a round yet leaves everyone in play", () => {
  expect(states({ name: "Solos", rounds: [] })).toEqual({
    Alpha: "playing",
    Bravo: "playing",
    Charlie: "playing",
    Delta: "playing",
  });
});

test("admins, no-shows and players with no in-game name are not in the field", () => {
  const field = fieldOf({ name: "Solos", rounds: [] }, ROSTER);
  expect(field.map((p) => p.ingame)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("a name missing from a board went out on that round", () => {
  const show: Show = {
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] }],
  };
  expect(states(show)).toEqual({
    Alpha: "through",
    Bravo: "through",
    Charlie: "through",
    Delta: "out",
  });
  expect(fieldOf(show, ROSTER).find((p) => p.ingame === "Delta")?.outAt).toBe(1);
});

test("survivors go back into play once the next round has loaded", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival" },
    ],
  };
  expect(states(show)).toEqual({
    Alpha: "playing",
    Bravo: "playing",
    Charlie: "playing",
    Delta: "out",
  });
});

test("a player only goes out on the first board that drops them", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha"] },
    ],
  };
  const field = fieldOf(show, ROSTER);
  expect(field.find((p) => p.ingame === "Charlie")?.outAt).toBe(1);
  expect(field.find((p) => p.ingame === "Bravo")?.outAt).toBe(2);
});

test("a finished show crowns its winners and leaves the finalists through", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final" },
    ],
    winners: ["Alpha"],
  };
  expect(states(show)).toEqual({
    Alpha: "won",
    Bravo: "through",
    Charlie: "out",
    Delta: "out",
  });
});

test("rounds crossed first are counted against the player", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Alpha" },
      { map: "Tip Toe", type: "race", first: "Alpha" },
      { map: "Hoopsie", type: "race", first: "Bravo" },
    ],
  };
  const field = fieldOf(show, ROSTER);
  expect(field.find((p) => p.ingame === "Alpha")?.firsts).toEqual([1, 2]);
  expect(field.find((p) => p.ingame === "Bravo")?.firsts).toEqual([3]);
  expect(field.find((p) => p.ingame === "Charlie")?.firsts).toEqual([]);
});

test("winners lead, then the living, then the out, alphabetically inside each", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Bravo", "Charlie"] },
      { map: "Fall Mountain", type: "final" },
    ],
    winners: ["Charlie"],
  };
  expect(fieldOf(show, ROSTER).map((p) => p.ingame)).toEqual([
    "Charlie",
    "Bravo",
    "Alpha",
    "Delta",
  ]);
});

function beansOf(show: Show): string[][] {
  return roundFieldsOf(show, ROSTER).map((round) => round.map((p) => `${p.ingame}:${p.state}`));
}

test("round one greens its board and reds everyone the roster lost, board or no board", () => {
  const show: Show = {
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo"] }],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:through", "Bravo:through", "Charlie:out", "Delta:out"],
  ]);
});

test("a round only reds the players it took, not the ones already gone", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha"] },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:through", "Bravo:through", "Charlie:through", "Delta:out"],
    ["Alpha:through", "Bravo:out", "Charlie:out"],
  ]);
});

test("a round nobody read a board for greys everyone still in", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival" },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:through", "Bravo:through", "Charlie:through", "Delta:out"],
    ["Alpha:playing", "Bravo:playing", "Charlie:playing"],
  ]);
});

test("deaths nobody read surface on the next round that was read", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race" },
      { map: "Roll Out", type: "survival", qualified: ["Alpha"] },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:playing", "Bravo:playing", "Charlie:playing", "Delta:playing"],
    ["Alpha:through", "Bravo:out", "Charlie:out", "Delta:out"],
  ]);
});

test("a final one player won badges nobody, since the round already names the winner", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Fall Mountain", type: "final" },
    ],
    winners: ["Bravo"],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:through", "Bravo:through", "Charlie:through", "Delta:out"],
    [],
  ]);
});

test("a final two players won crowns both and nobody else", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Fall Mountain", type: "final" },
    ],
    winners: ["Charlie", "Alpha"],
  };
  expect(beansOf(show)[1]).toEqual(["Alpha:won", "Charlie:won"]);
});

test("a final still being played greys its finalists", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final" },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:through", "Bravo:through", "Charlie:out", "Delta:out"],
    ["Alpha:playing", "Bravo:playing"],
  ]);
});

test("a round that took nobody greens the whole field", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie", "Delta"] },
    ],
  };
  expect(beansOf(show)).toEqual([
    ["Alpha:through", "Bravo:through", "Charlie:through", "Delta:through"],
  ]);
});

test("a show with no rounds has no badge rows", () => {
  expect(roundFieldsOf({ name: "Solos", rounds: [] }, ROSTER)).toEqual([]);
});

test("a badge carries the rounds that player crossed first", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", first: "Delta", qualified: ["Alpha", "Bravo"] },
    ],
  };
  expect(roundFieldsOf(show, ROSTER)[0]?.find((p) => p.ingame === "Delta")?.firsts).toEqual([1]);
});

test("who is still in going into a round is the roster minus every board before it", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final" },
    ],
  };
  const roster = ["Alpha", "Bravo", "Charlie", "Delta"];
  expect(aliveInto(show, roster, 0)).toEqual(roster);
  expect(aliveInto(show, roster, 1)).toEqual(["Alpha", "Bravo", "Charlie"]);
  expect(aliveInto(show, roster, 2)).toEqual(["Alpha", "Bravo"]);
  expect(aliveInto(show, roster, 3)).toEqual(["Alpha", "Bravo"]);
});

test("a round nobody has read a board off drops nobody", () => {
  const show: Show = {
    name: "Solos",
    rounds: [{ map: "Dizzy Heights", type: "race" }, { map: "Roll Out", type: "survival" }],
  };
  expect(aliveInto(show, ["Alpha", "Bravo"], 2)).toEqual(["Alpha", "Bravo"]);
});
