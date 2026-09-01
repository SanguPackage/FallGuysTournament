import { expect, test } from "bun:test";
import {
  defaultMessage,
  draftFor,
  namesByPoints,
  namesInShows,
  draftFromShow,
  suggestShowName,
  syncDraft,
  toShow,
  missingFrom,
  validate,
} from "./admin-model";
import type { Players, TournamentEvent } from "../src/types";
import type { ShowInOrder } from "./rules";
import type { ParsedShow } from "../src/log";
import { identify } from "../src/rounds";

const parsed: ParsedShow = {
  showId: "event_only_finals_v3_template",
  players: 4,
  localPlayerId: 1,
  winnerId: 3,
  rounds: [
    { id: "round_gauntlet_02_solos", name: "Dizzy Heights", type: "race", isFinal: false, timedOut: false, present: [1, 2, 3, 4], qualified: [1, 2, 3], eliminated: [4] },
    { id: "round_floor_fall_final", name: "Hex-A-Gone", type: "final", isFinal: true, timedOut: false, present: [1, 2, 3], qualified: [3], eliminated: [1, 2] },
  ],
};

test("a draft mirrors the parsed rounds, with the last marked final", () => {
  const draft = draftFor(parsed);
  expect(draft.rounds.map((round) => round.map)).toEqual(["Dizzy Heights", "Hex-A-Gone"]);
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
      { map: "Dizzy Heights", type: "race", first: "oopman" },
      { map: "Hex-A-Gone", type: "final" },
    ],
    finalists: ["oopman", "nicksonn", "f1xel"],
    winners: ["oopman"],
  });
});

test("a survival round carries no first place", () => {
  const draft = draftFor(parsed);
  draft.rounds[0]!.type = "survival";
  draft.rounds[0]!.first = "oopman";
  expect(toShow(draft).rounds[0]).toEqual({ map: "Dizzy Heights", type: "survival" });
});


function complete() {
  const draft = draftFor(parsed);
  draft.name = "Finals Marathon";
  draft.rounds[0]!.first = "oopman";
  draft.finalists = ["oopman", "nicksonn", "f1xel"];
  draft.winners = ["oopman"];
  return draft;
}

test("a saved show reopens with everything that was entered", () => {
  const parsedShow: ParsedShow = {
    showId: "s",
    rounds: [
      { id: "one", name: "one", type: "unknown", isFinal: false, timedOut: false, present: [], qualified: [], eliminated: [] },
      { id: "two", name: "two", type: "final", isFinal: true, timedOut: false, present: [1, 2], qualified: [], eliminated: [] },
    ],
    winnerId: 1,
  };
  const draft = draftFromShow(
    {
      name: "Solos",
      rounds: [
        { map: "one", type: "race", first: "oopman" },
        { map: "two", type: "final" },
      ],
      finalists: ["oopman", "f1xel"],
      winners: ["oopman"],
    },
    parsedShow,
  );

  expect(draft.name).toBe("Solos");
  expect(draft.rounds[0]).toMatchObject({ map: "one", type: "race", first: "oopman" });
  expect(draft.finalists).toEqual(["oopman", "f1xel"]);
  expect(draft.winners).toEqual(["oopman"]);
});

test("reopening keeps a round type the log would have guessed differently", () => {
  const draft = draftFromShow(
    { name: "Solos", rounds: [{ map: "one", type: "survival" }], finalists: [], winners: [] },
    {
      showId: "s",
      rounds: [
        { id: "one", name: "one", type: "final", isFinal: true, timedOut: false, present: [], qualified: [], eliminated: [] },
      ],
      winnerId: undefined,
    },
  );

  expect(draft.rounds[0]!.type).toBe("survival");
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

const order: ShowInOrder[] = [
  { position: 1, show: "Solos", tier: "Opening", min: 2, max: 32 },
  { position: 2, show: "Fan Favourites", tier: "Opening", min: 5, max: 32 },
  { position: 3, show: "Roll Call", tier: "Advanced", min: 5, max: 32 },
];

test("the first show is named after the first in the planned order", () => {
  expect(suggestShowName(order, [])).toBe("Solos");
});

test("the suggestion moves on to the next show as they are recorded", () => {
  expect(suggestShowName(order, ["Solos"])).toBe("Fan Favourites");
});

test("a show the lobby skipped is passed over rather than suggested again", () => {
  expect(suggestShowName(order, ["Solos", "Roll Call"])).toBe("Fan Favourites");
});

test("past the end of the order there is nothing to suggest", () => {
  expect(suggestShowName(order, ["Solos", "Fan Favourites", "Roll Call"])).toBe("");
});

test("a round that appears in the log while typing is appended, leaving entries alone", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");
  draft.rounds.push({ map: "Wall Guys", type: "race", first: "Alpha" });

  syncDraft(draft, {
    showId: "s",
    rounds: [
      { id: "round_wall_guys_solos", name: "Wall Guys", type: "race", isFinal: false, timedOut: false, present: [], qualified: [], eliminated: [] },
      { id: "round_floor_fall_final", name: "Hex-A-Gone", type: "final", isFinal: true, timedOut: false, present: [1, 2], qualified: [], eliminated: [] },
    ],
    winnerId: undefined,
  });

  expect(draft.rounds).toHaveLength(2);
  expect(draft.rounds[0]).toEqual({ map: "Wall Guys", type: "race", first: "Alpha" });
  expect(draft.rounds[1]!.map).toBe("Hex-A-Gone");
  expect(draft.rounds[1]!.type).toBe("final");
});

test("the finalist slots grow with the final's field, keeping the names already typed", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");
  draft.finalists = ["Alpha"];

  syncDraft(draft, {
    showId: "s",
    rounds: [
      { id: "final", name: "final", type: "final", isFinal: true, timedOut: false, present: [1, 2, 3], qualified: [], eliminated: [] },
    ],
    winnerId: undefined,
  });

  expect(draft.finalists).toEqual(["Alpha", "", ""]);
});

test("a winner appearing in the log opens a slot for their name", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");
  expect(draft.winners).toEqual([]);
  syncDraft(draft, { showId: "s", rounds: [], winnerId: 7 });
  expect(draft.winners).toEqual([""]);
});

test("syncing never drops a winner slot the admin added by hand", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: 7 }, "Solos");
  draft.winners = ["Alpha", "Bravo"];
  syncDraft(draft, { showId: "s", rounds: [], winnerId: 7 });
  expect(draft.winners).toEqual(["Alpha", "Bravo"]);
});

test("a draft starts out named after the planned show", () => {
  expect(draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos").name).toBe("Solos");
});

const RACE = "round_wall_guys_solos";
const FINAL = "round_floor_fall_final";

function parsedRound(id: string, isFinal: boolean) {
  const round = { id, ...identify(id), isFinal, timedOut: false, present: [], qualified: [], eliminated: [] };
  if (isFinal) round.type = "final";
  return round;
}

test("a round stops being the final once another one loads after it", () => {
  const draft = draftFor({ showId: "s", rounds: [parsedRound(RACE, true)] }, "Solos");
  expect(draft.rounds[0]!.type).toBe("final");

  syncDraft(draft, { showId: "s", rounds: [parsedRound(RACE, false), parsedRound(FINAL, true)] });
  expect(draft.rounds.map((round) => round.type)).toEqual(["race", "final"]);
});

test("a type the admin picked is never overwritten by the log", () => {
  const draft = draftFor({ showId: "s", rounds: [parsedRound(RACE, true)] }, "Solos");
  draft.rounds[0]!.type = "survival";
  draft.rounds[0]!.typeEdited = true;

  syncDraft(draft, { showId: "s", rounds: [parsedRound(RACE, false), parsedRound(FINAL, true)] });
  expect(draft.rounds[0]!.type).toBe("survival");
});

test("names already entered in a show are offered again", () => {
  const names = namesInShows({
    name: "FOM",
    date: "d",
    shows: [
      {
        name: "Solos",
        rounds: [
          { map: "m", type: "race", first: "Bravo" },
          { map: "n", type: "final" },
        ],
        finalists: ["Bravo", "Alpha"],
        winners: ["Alpha"],
      },
    ],
    penalties: [],
  });
  expect(names).toEqual(["Alpha", "Bravo"]);
});

test("no shows played yet means nothing to offer", () => {
  expect(namesInShows({ name: "FOM", date: "d", shows: [], penalties: [] })).toEqual([]);
});

const scored: TournamentEvent = {
  name: "FOM",
  date: "d",
  shows: [
    {
      name: "Solos",
      rounds: [
        { map: "m", type: "race", first: "Bravo" },
        { map: "n", type: "final" },
      ],
      finalists: ["Bravo", "Alpha", "Delta"],
      winners: ["Alpha"],
    },
  ],
  penalties: [],
};

const roster: Players = {
  players: [
    { fom: "A", ingame: "Alpha" },
    { fom: "B", ingame: "Bravo" },
    { fom: "C", ingame: "Charlie" },
    { fom: "D", ingame: "Delta" },
    { fom: "Ref", ingame: "Referee", admin: true },
  ],
};

test("the name list leads with whoever has the most points", () => {
  // Alpha 1 final + 5 win = 6, Bravo 3 race + 1 final = 4, Delta 1 final = 1
  expect(namesByPoints(scored, roster).slice(0, 3)).toEqual(["Alpha", "Bravo", "Delta"]);
});

test("players level on points are listed alphabetically", () => {
  expect(namesByPoints(scored, roster).slice(3)).toEqual(["Charlie"]);
});

test("the admin runs the event rather than playing, so they are never offered", () => {
  expect(namesByPoints(scored, roster)).not.toContain("Referee");
});

test("an admin name that found its way into a show is still kept out", () => {
  const withAdmin: TournamentEvent = {
    ...scored,
    shows: [{ ...scored.shows[0]!, rounds: [{ map: "m", type: "race", first: "Referee" }] }],
  };
  expect(namesByPoints(withAdmin, roster)).not.toContain("Referee");
});

test("a name typed into a show but never registered is still offered", () => {
  const withGuest: TournamentEvent = {
    ...scored,
    shows: [{ ...scored.shows[0]!, rounds: [{ map: "m", type: "race", first: "Zulu" }] }],
  };
  expect(namesByPoints(withGuest, roster)).toContain("Zulu");
});

test("with nothing played the list is alphabetical", () => {
  expect(namesByPoints({ name: "FOM", date: "d", shows: [], penalties: [] }, roster)).toEqual([
    "Alpha",
    "Bravo",
    "Charlie",
    "Delta",
  ]);
});

test("a show needs a name", () => {
  const draft = complete();
  draft.name = "  ";
  expect(validate(draft)).toEqual(["Give the show a name."]);
});

test("the same finalist twice is a slip worth catching", () => {
  const draft = complete();
  draft.finalists = ["oopman", "oopman", "f1xel"];
  expect(validate(draft)).toEqual(["oopman is listed twice as a finalist."]);
});

test("a winner who was never listed as a finalist is taken as entered", () => {
  const draft = complete();
  draft.finalists = ["oopman"];
  draft.winners = ["f1xel"];
  expect(validate(draft)).toEqual([]);
});

const played: ParsedShow = {
  showId: "s",
  rounds: [
    { id: "one", name: "one", type: "unknown", isFinal: false, timedOut: false, present: [], qualified: [], eliminated: [] },
    { id: "two", name: "two", type: "final", isFinal: true, timedOut: false, present: [1, 2], qualified: [], eliminated: [] },
  ],
  winnerId: 1,
};

test("a show nobody has recorded yet is missing everything", () => {
  expect(missingFrom(undefined, played)).toEqual([
    "name",
    "2 rounds not entered",
    "finalists",
    "winners",
  ]);
});

test("the gaps in a half-filled show are named one by one", () => {
  const show = {
    name: "",
    rounds: [
      { map: "one", type: "race" as const },
      { map: "two", type: "final" as const },
    ],
    finalists: [],
    winners: [],
  };
  expect(missingFrom(show, played)).toEqual([
    "name",
    "first place in round 1",
    "finalists",
    "winners",
  ]);
});

test("rounds played since the show was saved count as missing", () => {
  const show = {
    name: "Solos",
    rounds: [{ map: "one", type: "race" as const, first: "oopman" }],
    finalists: ["oopman"],
    winners: ["oopman"],
  };
  expect(missingFrom(show, played)).toEqual(["1 round not entered"]);
});

test("a show with nothing left to fill in reports no gaps", () => {
  const show = {
    name: "Solos",
    rounds: [
      { map: "one", type: "race" as const, first: "oopman" },
      { map: "two", type: "final" as const },
    ],
    finalists: ["oopman", "f1xel"],
    winners: ["oopman"],
  };
  expect(missingFrom(show, played)).toEqual([]);
});

test("a round is drafted under its published name and type, not the log's level id", () => {
  const draft = draftFor({
    showId: "s",
    rounds: [
      { id: "round_tail_tag_solos", name: "Tail Tag", type: "hunt", isFinal: false, timedOut: false, present: [], qualified: [], eliminated: [] },
      { id: "round_floor_fall_final", name: "Hex-A-Gone", type: "final", isFinal: true, timedOut: false, present: [], qualified: [], eliminated: [] },
    ],
    winnerId: undefined,
  });
  expect(draft.rounds.map((round) => [round.map, round.type])).toEqual([
    ["Tail Tag", "hunt"],
    ["Hex-A-Gone", "final"],
  ]);
});

test("a first typed into a round that turns out to score nothing is dropped on save", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");
  draft.rounds.push({ map: "Hex-A-Gone", type: "survival", first: "Alpha", typeEdited: true });
  expect(toShow(draft).rounds[0]).toEqual({ map: "Hex-A-Gone", type: "survival" });
});

test("a first typed into a hunt round is kept on save", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");
  draft.rounds.push({ map: "Airtime", type: "hunt", first: "Alpha", typeEdited: true });
  expect(toShow(draft).rounds[0]).toEqual({ map: "Airtime", type: "hunt", first: "Alpha" });
});

test("the final's survivors give the winner slots, however many there are", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");

  syncDraft(draft, {
    showId: "s",
    rounds: [
      {
        id: "final",
        isFinal: true,
        timedOut: false,
        present: [1, 2, 3],
        qualified: [1, 2],
        eliminated: [3],
      },
    ],
    winnerId: undefined,
  });

  expect(draft.winners).toEqual(["", ""]);
});

test("a win the server announced with nobody qualifying still gets a slot", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");

  syncDraft(draft, {
    showId: "s",
    rounds: [
      { id: "final", isFinal: true, timedOut: true, present: [1], qualified: [], eliminated: [1] },
    ],
    winnerId: 1,
  });

  expect(draft.winners).toEqual([""]);
});
