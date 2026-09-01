import { expect, test } from "bun:test";
import { defaultMessage, draftFor, toShow, validate } from "./admin-model";
import type { ParsedShow } from "../src/log";

const parsed: ParsedShow = {
  showId: "event_only_finals_v3_template",
  players: 4,
  localPlayerId: 1,
  winnerId: 3,
  rounds: [
    { id: "gold_rush", isFinal: false, timedOut: false, present: [1, 2, 3, 4], qualified: [1, 2, 3], eliminated: [4] },
    { id: "floor_fall_final", isFinal: true, timedOut: false, present: [1, 2, 3], qualified: [3], eliminated: [1, 2] },
  ],
};

test("a draft mirrors the parsed rounds, with the last marked final", () => {
  const draft = draftFor(parsed);
  expect(draft.rounds.map((round) => round.map)).toEqual(["gold_rush", "floor_fall_final"]);
  expect(draft.rounds.map((round) => round.type)).toEqual(["race", "final"]);
});

test("a draft asks for one finalist name per player who started the final", () => {
  expect(draftFor(parsed).finalists).toHaveLength(3);
});

test("a draft asks for one winner, since the log reports one", () => {
  expect(draftFor(parsed).winners).toHaveLength(1);
});

test("a show with no winner asks for none", () => {
  const draft = draftFor({ ...parsed, winnerId: undefined });
  expect(draft.winners).toHaveLength(0);
});

test("a draft becomes a show, dropping the final from the scored rounds' first place", () => {
  const draft = draftFor(parsed);
  draft.name = "Finals Marathon";
  draft.rounds[0]!.first = "oopman";
  draft.finalists = ["oopman", "nicksonn", "f1xel"];
  draft.winners = ["oopman"];

  expect(toShow(draft)).toEqual({
    name: "Finals Marathon",
    rounds: [
      { map: "gold_rush", type: "race", first: "oopman" },
      { map: "floor_fall_final", type: "final" },
    ],
    finalists: ["oopman", "nicksonn", "f1xel"],
    winners: ["oopman"],
  });
});

test("a survival round carries no first place", () => {
  const draft = draftFor(parsed);
  draft.rounds[0]!.type = "survival";
  draft.rounds[0]!.first = "oopman";
  expect(toShow(draft).rounds[0]).toEqual({ map: "gold_rush", type: "survival" });
});

const registered = ["oopman", "nicksonn", "f1xel"];

function complete() {
  const draft = draftFor(parsed);
  draft.name = "Finals Marathon";
  draft.rounds[0]!.first = "oopman";
  draft.finalists = ["oopman", "nicksonn", "f1xel"];
  draft.winners = ["oopman"];
  return draft;
}

test("a complete draft validates", () => {
  expect(validate(complete(), registered)).toEqual([]);
});

test("a show needs a name", () => {
  const draft = complete();
  draft.name = "  ";
  expect(validate(draft, registered)).toContain("Give the show a name.");
});

test("a race round needs whoever crossed first", () => {
  const draft = complete();
  draft.rounds[0]!.first = "";
  expect(validate(draft, registered)).toContain("Round 1 is a race and needs a first place.");
});

test("unregistered names are rejected", () => {
  const draft = complete();
  draft.finalists = ["oopman", "nicksonn", "ghost"];
  expect(validate(draft, registered)).toContain(`"ghost" is not a registered player.`);
});

test("a winner has to have reached the final", () => {
  const draft = complete();
  draft.winners = ["f1xel"];
  draft.finalists = ["oopman", "nicksonn"];
  expect(validate(draft, registered)).toContain("Winners must be finalists: f1xel.");
});

test("the same player cannot be listed twice as a finalist", () => {
  const draft = complete();
  draft.finalists = ["oopman", "oopman", "f1xel"];
  expect(validate(draft, registered)).toContain("oopman is listed twice as a finalist.");
});

test("blank finalist slots are allowed, so a show can be saved part-filled", () => {
  const draft = complete();
  draft.finalists = ["oopman", "", ""];
  expect(validate(draft, registered)).toEqual([]);
});

test("blanks are dropped from the saved show", () => {
  const draft = complete();
  draft.finalists = ["oopman", "", "f1xel"];
  expect(toShow(draft).finalists).toEqual(["oopman", "f1xel"]);
});

test("with no shows recorded the commit message is about the players", () => {
  expect(defaultMessage({ name: "FOM", date: "d", shows: [], penalties: [] })).toBe(
    "data: update players",
  );
});

test("the commit message names the show just recorded", () => {
  expect(
    defaultMessage({
      name: "FOM",
      date: "d",
      shows: [
        { name: "Solos", rounds: [] },
        { name: "Roll Call", rounds: [] },
      ],
      penalties: [],
    }),
  ).toBe("data: record show 2 — Roll Call");
});
