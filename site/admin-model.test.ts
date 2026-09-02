import { expect, test } from "bun:test";
import {
  applyFills,
  captureBadge,
  newFillMemo,
  defaultMessage,
  draftFor,
  namesByPoints,
  resyncRound,
  resyncWinners,
  namesInShows,
  draftFromShow,
  suggestShowName,
  syncDraft,
  toShow,
  missingFrom,
  validate,
} from "./admin-model";
import type { ShowDraft } from "./admin-model";
import type { SlotFill } from "../src/ocr/autofill";
import type { Players, RoundType, TournamentEvent } from "../src/types";
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

test("a draft asks for one name per player the log counted through the round", () => {
  expect(draftFor(parsed).rounds[0]!.qualified).toHaveLength(3);
});

test("the log's own count rides along, so a round says how many got through untyped", () => {
  expect(draftFor(parsed).rounds[0]!.survivors).toBe(3);
  expect(toShow(draftFor(parsed)).rounds[0]!.survivors).toBe(3);
});

test("the final is crowned by its winner, so it carries no count of its own", () => {
  expect(toShow(draftFor(parsed)).rounds[1]).not.toHaveProperty("survivors");
});

test("a round the log has not counted yet carries no count", () => {
  const draft = draftFor(midShow([playing("wall_guys", "race", [1, 2, 3, 4, 5])]), "Solos 1");
  expect(toShow(draft).rounds[0]).not.toHaveProperty("survivors");
});

test("a draft asks for one winner, since the log reports one", () => {
  expect(draftFor(parsed).winners).toHaveLength(1);
});

test("a final nobody has come through yet asks for no winner", () => {
  const unfinished = {
    ...parsed,
    winnerId: undefined,
    rounds: [parsed.rounds[0]!, { ...parsed.rounds[1]!, qualified: [], eliminated: [] }],
  };
  expect(draftFor(unfinished).winners).toHaveLength(0);
});

test("a draft becomes a show, dropping the final from the scored rounds' first place", () => {
  const draft = draftFor(parsed);
  draft.name = "Finals Marathon";
  draft.rounds[0]!.first = "oopman";
  draft.rounds[0]!.qualified = ["oopman", "nicksonn", "f1xel"];
  draft.winners = ["oopman"];

  expect(toShow(draft)).toEqual({
    name: "Finals Marathon",
    rounds: [
      {
        map: "Dizzy Heights",
        type: "race",
        first: "oopman",
        qualified: ["oopman", "nicksonn", "f1xel"],
        survivors: 3,
      },
      { map: "Hex-A-Gone", type: "final" },
    ],
    winners: ["oopman"],
  });
});

test("a survival round carries no first place", () => {
  const draft = draftFor(parsed);
  draft.rounds[0]!.type = "survival";
  draft.rounds[0]!.first = "oopman";
  expect(toShow(draft).rounds[0]).toEqual({ map: "Dizzy Heights", type: "survival", survivors: 3 });
});


function complete() {
  const draft = draftFor(parsed);
  draft.name = "Finals Marathon";
  draft.rounds[0]!.first = "oopman";
  draft.rounds[0]!.qualified = ["oopman", "nicksonn", "f1xel"];
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
        { map: "one", type: "race", first: "oopman", qualified: ["oopman", "f1xel"] },
        { map: "two", type: "final" },
      ],
      winners: ["oopman"],
    },
    parsedShow,
  );

  expect(draft.name).toBe("Solos");
  expect(draft.rounds[0]).toMatchObject({ map: "one", type: "race", first: "oopman" });
  expect(draft.rounds[0]!.qualified).toEqual(["oopman", "f1xel"]);
  expect(draft.winners).toEqual(["oopman"]);
});

test("reopening keeps a round type the log would have guessed differently", () => {
  const draft = draftFromShow(
    { name: "Solos", rounds: [{ map: "one", type: "survival" }], winners: [] },
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
  draft.rounds[0]!.qualified = ["oopman", "", "f1xel"];
  expect(toShow(draft).rounds[0]!.qualified).toEqual(["oopman", "f1xel"]);
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

const solos = (showId: string): ParsedShow => ({ showId, rounds: [], winnerId: undefined });

test("a show is named for its playlist and its turn", () => {
  const shows = [solos("classic_solo_main_show"), solos("classic_solo_main_show")];
  expect(suggestShowName(shows, 0)).toBe("Solos 1");
  expect(suggestShowName(shows, 1)).toBe("Solos 2");
});

test("counting starts again for a different playlist", () => {
  const shows = [solos("classic_solo_main_show"), solos("event_only_finals_v3_template")];
  expect(suggestShowName(shows, 1)).toBe("event_only_finals_v3_template 1");
});

test("a show the log has not reached has no name to suggest", () => {
  expect(suggestShowName([], 0)).toBe("");
});

test("a round that appears in the log while typing is appended, leaving entries alone", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");
  draft.rounds.push({ map: "Wall Guys", type: "race", first: "Alpha", qualified: [] });

  syncDraft(draft, {
    showId: "s",
    rounds: [
      { id: "round_wall_guys_solos", name: "Wall Guys", type: "race", isFinal: false, timedOut: false, present: [], qualified: [], eliminated: [] },
      { id: "round_floor_fall_final", name: "Hex-A-Gone", type: "final", isFinal: true, timedOut: false, present: [1, 2], qualified: [], eliminated: [] },
    ],
    winnerId: undefined,
  });

  expect(draft.rounds).toHaveLength(2);
  expect(draft.rounds[0]).toEqual({ map: "Wall Guys", type: "race", first: "Alpha", qualified: [] });
  expect(draft.rounds[1]!.map).toBe("Hex-A-Gone");
  expect(draft.rounds[1]!.type).toBe("final");
});

test("the qualified slots grow with the log's count, keeping the names already typed", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");

  syncDraft(draft, {
    showId: "s",
    rounds: [
      { id: "one", name: "one", type: "race", isFinal: false, timedOut: false, present: [1, 2, 3, 4], qualified: [1], eliminated: [] },
    ],
    winnerId: undefined,
  });
  draft.rounds[0]!.qualified = ["Alpha"];

  syncDraft(draft, {
    showId: "s",
    rounds: [
      { id: "one", name: "one", type: "race", isFinal: false, timedOut: false, present: [1, 2, 3, 4], qualified: [1, 2, 3], eliminated: [] },
    ],
    winnerId: undefined,
  });

  expect(draft.rounds[0]!.qualified).toEqual(["Alpha", "", ""]);
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
          { map: "m", type: "race", first: "Bravo", qualified: ["Bravo", "Alpha"] },
          { map: "n", type: "final" },
        ],
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
        { map: "m", type: "race", first: "Bravo", qualified: ["Bravo", "Alpha", "Delta"] },
        { map: "n", type: "final" },
      ],
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

test("the same name twice on one board is a slip worth catching", () => {
  const draft = complete();
  draft.rounds[0]!.qualified = ["oopman", "oopman", "f1xel"];
  expect(validate(draft)).toEqual(["oopman is listed twice as qualifying from round 1."]);
});

test("a winner who was never listed as a finalist is taken as entered", () => {
  const draft = complete();
  draft.rounds[0]!.qualified = ["oopman"];
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
    rounds: [{ map: "one", type: "race" as const, first: "oopman", qualified: ["oopman"] }],
    winners: ["oopman"],
  };
  // The final has not been entered, so nothing yet says who reached it.
  expect(missingFrom(show, played)).toEqual(["1 round not entered", "finalists"]);
});

test("a show with nothing left to fill in reports no gaps", () => {
  const show = {
    name: "Solos",
    rounds: [
      { map: "one", type: "race" as const, first: "oopman", qualified: ["oopman", "f1xel"] },
      { map: "two", type: "final" as const },
    ],
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
  draft.rounds.push({
    map: "Hex-A-Gone",
    type: "survival",
    first: "Alpha",
    qualified: [],
    typeEdited: true,
  });
  expect(toShow(draft).rounds[0]).toEqual({ map: "Hex-A-Gone", type: "survival" });
});

test("a first typed into a hunt round is kept on save", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");
  draft.rounds.push({
    map: "Airtime",
    type: "hunt",
    first: "Alpha",
    qualified: [],
    typeEdited: true,
  });
  expect(toShow(draft).rounds[0]).toEqual({ map: "Airtime", type: "hunt", first: "Alpha" });
});

test("the final's survivors give the winner slots, however many there are", () => {
  const draft = draftFor({ showId: "s", rounds: [], winnerId: undefined }, "Solos");

  syncDraft(draft, {
    showId: "s",
    rounds: [
      {
        id: "final",
        name: "Hex-A-Gone",
        type: "final",
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
      {
        id: "final",
        name: "Hex-A-Gone",
        type: "final",
        isFinal: true,
        timedOut: true,
        present: [1],
        qualified: [],
        eliminated: [1],
      },
    ],
    winnerId: 1,
  });

  expect(draft.winners).toEqual([""]);
});

const midShow = (rounds: ParsedShow["rounds"]): ParsedShow => ({
  showId: "classic_solo_main_show",
  rounds,
  winnerId: undefined,
});

const playing = (id: string, type: RoundType, present: number[], qualified: number[] = []) => ({
  id,
  name: id,
  type,
  isFinal: type === "final",
  timedOut: false,
  present,
  qualified,
  eliminated: [],
});

test("a round still being played opens no qualified slots", () => {
  const draft = draftFor(midShow([playing("wall_guys", "race", [1, 2, 3, 4, 5])]), "Solos 1");
  expect(draft.rounds[0]!.qualified).toEqual([]);
  expect(draft.winners).toEqual([]);
});

test("the slots follow what the log has counted through", () => {
  const draft = draftFor(midShow([playing("wall_guys", "race", [1, 2, 3, 4, 5])]), "Solos 1");

  syncDraft(draft, midShow([playing("wall_guys", "race", [1, 2, 3, 4, 5], [1, 2])]));
  expect(draft.rounds[0]!.qualified).toEqual(["", ""]);

  syncDraft(draft, midShow([playing("wall_guys", "race", [1, 2, 3, 4, 5], [1, 2, 3])]));
  expect(draft.rounds[0]!.qualified).toEqual(["", "", ""]);
});

test("slots that shrink give back only the ones nobody typed into", () => {
  const draft = draftFor(
    midShow([playing("wall_guys", "race", [1, 2, 3, 4], [1, 2, 3, 4])]),
    "Solos 1",
  );
  draft.rounds[0]!.qualified[0] = "oopman";

  syncDraft(draft, midShow([playing("wall_guys", "race", [1, 2, 3, 4], [1, 2])]));
  expect(draft.rounds[0]!.qualified).toEqual(["oopman", ""]);
});

function draftOf(): ShowDraft {
  return {
    name: "Solos",
    rounds: [
      { map: "Wall Guys", type: "race", first: "", qualified: ["", ""] },
      { map: "Airtime", type: "hunt", first: "Optinux_Prime", qualified: [] },
    ],
    winners: [""],
  };
}

const FILLS: SlotFill[] = [
  { showIndex: 0, slot: "first", roundIndex: 0, names: ["Serxav_9"], from: "a.jpg" },
  { showIndex: 0, slot: "first", roundIndex: 1, names: ["Diego_9942"], from: "b.jpg" },
  {
    showIndex: 0,
    slot: "qualified",
    roundIndex: 0,
    names: ["Diego_9942", "Serxav_9"],
    from: "c.jpg",
  },
  { showIndex: 0, slot: "winners", names: ["Diego_9942"], from: "d.jpg" },
];

test("a fill lands only where nothing has been typed", () => {
  const draft = draftOf();
  expect(applyFills(draft, FILLS, 0, newFillMemo())).toBe(true);
  expect(draft.rounds[0]!.first).toBe("Serxav_9");
  expect(draft.rounds[1]!.first).toBe("Optinux_Prime");
  expect(draft.rounds[0]!.qualified).toEqual(["Diego_9942", "Serxav_9"]);
  expect(draft.winners).toEqual(["Diego_9942"]);
});

test("every filled field records the capture it was read off", () => {
  const memo = newFillMemo();
  applyFills(draftOf(), FILLS, 0, memo);
  expect(memo.sources.get("show:0:round:0:first")).toBe("a.jpg");
  expect(memo.sources.get("show:0:round:0:qualified:0")).toBe("c.jpg");
  expect(memo.sources.get("show:0:winner:0")).toBe("d.jpg");
  expect(memo.sources.has("show:0:round:1:first")).toBe(false);
});

test("applying the same fills twice changes nothing the second time", () => {
  const draft = draftOf();
  const memo = newFillMemo();
  expect(applyFills(draft, FILLS, 0, memo)).toBe(true);
  expect(applyFills(draft, FILLS, 0, memo)).toBe(false);
});

test("a field emptied on purpose is not filled again", () => {
  const draft = draftOf();
  const memo = newFillMemo();
  applyFills(draft, FILLS, 0, memo);
  draft.rounds[0]!.first = "";
  draft.rounds[0]!.qualified = ["", ""];
  expect(applyFills(draft, FILLS, 0, memo)).toBe(false);
  expect(draft.rounds[0]!.first).toBe("");
  expect(draft.rounds[0]!.qualified).toEqual(["", ""]);
});

test("a fill for another show is ignored", () => {
  const draft = draftOf();
  const other: SlotFill[] = [
    { showIndex: 1, slot: "qualified", roundIndex: 0, names: ["Diego_9942"], from: "c.jpg" },
  ];
  expect(applyFills(draft, other, 0, newFillMemo())).toBe(false);
  expect(draft.rounds[0]!.qualified).toEqual(["", ""]);
});

test("a show ticked off carries that through a reopen and a save", () => {
  const draft = draftFromShow(
    { name: "Solos", rounds: [], winners: [], checked: true },
    { showId: "s", rounds: [], winnerId: undefined },
  );
  expect(draft.checked).toBe(true);
  expect(toShow(draft).checked).toBe(true);
});

test("a show nobody has ticked off saves without the flag", () => {
  expect(toShow(complete())).not.toHaveProperty("checked");
});

test("someone who did not join is never offered, since they are not in the lobby", () => {
  const absent: Players = {
    players: [...roster.players, { fom: "E", ingame: "Echo", joined: false }],
  };
  expect(namesByPoints(scored, absent)).not.toContain("Echo");
});

test("joining is the default, so a player without the flag is still offered", () => {
  expect(namesByPoints(scored, roster)).toContain("Alpha");
});

test("a server started with --no-record says so rather than showing nothing", () => {
  expect(captureBadge(null)).toEqual({ text: "recording off", ok: false, title: "" });
});

test("a recording that is running says so, and mentions losing its sound", () => {
  expect(captureBadge({ running: true, audio: true })).toEqual({
    text: "recording",
    ok: true,
    title: "",
  });
  expect(captureBadge({ running: true, audio: false }).text).toBe("recording — no sound");
});

test("a recording that died shouts, since it is not the same as never having asked for one", () => {
  const died = captureBadge({ running: false, audio: true, error: "ffmpeg exit 1" });
  expect(died).toEqual({ text: "NOT RECORDING", ok: false, title: "ffmpeg exit 1" });
  expect(died.text).not.toBe(captureBadge(null).text);
});

test("resyncing a round drops what was read and keeps what was typed", () => {
  const draft = draftOf();
  const memo = newFillMemo();
  applyFills(draft, FILLS, 0, memo);
  // Correcting a field is what `nameInput` does: the value is yours, so its source goes.
  draft.rounds[0]!.qualified[1] = "Corrected";
  memo.sources.delete("show:0:round:0:qualified:1");

  resyncRound(draft, 0, 0, memo);

  expect(draft.rounds[0]!.first).toBe("");
  expect(draft.rounds[0]!.qualified).toEqual(["", "Corrected"]);
  // Nothing outside the round is touched.
  expect(draft.rounds[1]!.first).toBe("Optinux_Prime");
  expect(draft.winners).toEqual(["Diego_9942"]);
});

test("a resynced round takes the names a changed roster now reads", () => {
  const draft = draftOf();
  const memo = newFillMemo();
  applyFills(draft, FILLS, 0, memo);
  draft.rounds[0]!.qualified[1] = "Corrected";
  memo.sources.delete("show:0:round:0:qualified:1");
  resyncRound(draft, 0, 0, memo);

  const rematched: SlotFill[] = [
    { showIndex: 0, slot: "first", roundIndex: 0, names: ["BigMooseLips"], from: "a.jpg" },
    { showIndex: 0, slot: "qualified", roundIndex: 0, names: ["BigMooseLips"], from: "c.jpg" },
  ];
  expect(applyFills(draft, rematched, 0, memo)).toBe(true);
  expect(draft.rounds[0]!.first).toBe("BigMooseLips");
  expect(draft.rounds[0]!.qualified).toEqual(["BigMooseLips", "Corrected"]);
});

test("resyncing the winners drops what was read and keeps what was typed", () => {
  const draft = draftOf();
  draft.winners = ["", ""];
  const memo = newFillMemo();
  applyFills(draft, FILLS, 0, memo);
  expect(draft.winners[0]).toBe("Diego_9942");
  draft.winners[1] = "Corrected";

  resyncWinners(draft, 0, memo);
  expect(draft.winners).toEqual(["", "Corrected"]);

  // The final's name is the only one it has, so it must come back on the next fill.
  const rematched: SlotFill[] = [
    { showIndex: 0, slot: "winners", names: ["BigMooseLips"], from: "d.jpg" },
  ];
  expect(applyFills(draft, rematched, 0, memo)).toBe(true);
  expect(draft.winners).toEqual(["BigMooseLips", "Corrected"]);
});

test("resyncing the winners leaves the rounds alone", () => {
  const draft = draftOf();
  const memo = newFillMemo();
  applyFills(draft, FILLS, 0, memo);
  resyncWinners(draft, 0, memo);
  expect(draft.rounds[0]!.first).toBe("Serxav_9");
  expect(draft.rounds[0]!.qualified).toEqual(["Diego_9942", "Serxav_9"]);
});
