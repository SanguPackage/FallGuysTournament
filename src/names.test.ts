import { expect, test } from "bun:test";
import { mergeNames, namesIn } from "./names";
import type { TournamentEvent } from "./types";

test("takes every name a round and a show can hold", () => {
  const event = {
    shows: [
      {
        rounds: [{ first: "Zqxts", qualified: ["Luv2Miss", "Zqxts"] }, { qualified: ["Luv2Miss"] }],
        winners: ["RASSHADOW"],
      },
    ],
  } as unknown as TournamentEvent;
  expect(namesIn(event)).toEqual(["Luv2Miss", "RASSHADOW", "Zqxts"]);
});

test("a show with no winners and a round with no names is skipped", () => {
  const event = { shows: [{ rounds: [{}] }] } as unknown as TournamentEvent;
  expect(namesIn(event)).toEqual([]);
});

test("merging keeps what is already there and sorts the lot", () => {
  expect(mergeNames(["zeta", "Alpha"], ["beta", "Alpha"])).toEqual(["Alpha", "beta", "zeta"]);
});

test("names differing only in case are both kept", () => {
  expect(mergeNames([], ["bean", "Bean"])).toEqual(["Bean", "bean"]);
});

test("blank and whitespace-only entries are dropped", () => {
  expect(mergeNames([], ["  ", "", "Zqxts"])).toEqual(["Zqxts"]);
});

test("a name is trimmed before it is compared", () => {
  expect(mergeNames(["Zqxts"], [" Zqxts "])).toEqual(["Zqxts"]);
});
