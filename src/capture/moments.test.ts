// The log writes UTC while the event runs on Belgian time, so these must not run in UTC.
process.env.TZ = "Europe/Brussels";

import { expect, test } from "bun:test";
import { parseLog } from "../log";
import { showsOnDisk } from "./layout";
import { clipKey, momentKey, momentsIn, showClips } from "./moments";

const DATE = "2026-09-05";
const at = (clock: string) => Date.parse(`${DATE}T${clock}Z`);

const SHOW = `
20:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
20:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:00:44.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:01:00.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1s
20:01:30.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:01:32.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=False
20:01:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

/** The clock `SHOW`'s first round loaded at, in Brussels time. */
const STAMP = `${DATE}T22h00`;

const EARLIER_SHOW = `
19:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
19:00:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
19:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
19:00:44.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
19:01:00.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1s
19:01:30.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
19:01:32.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=False
19:01:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

const THREE_ROUND_SHOW = `
20:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
20:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:00:44.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:01:00.000: [StateGameLoading] Finished loading game level, assumed to be round_two. Duration: 1s
20:01:20.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:01:24.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:02:00.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1s
20:02:30.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:02:32.000: ClientGameManager::HandleServerPlayerProgress PlayerId=3 is succeeded=False
20:02:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

test("every round with a qualifier yields a first moment, windowed around it", () => {
  const firsts = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "first");
  expect(firsts.map((m) => [m.roundIndex, m.at, m.from, m.to, m.fps])).toEqual([
    [0, at("20:00:40"), at("20:00:40") - 500, at("20:00:40") + 10_000, 30],
    [1, at("20:01:30"), at("20:01:30") - 500, at("20:01:30") + 10_000, 30],
  ]);
});

test("the finalists moment follows the round before the final, not the final", () => {
  const [finalists] = momentsIn(parseLog(THREE_ROUND_SHOW), DATE).filter(
    (m) => m.kind === "finalists",
  );
  expect(finalists!.roundIndex).toBe(1);
  expect(finalists!.at).toBe(at("20:01:24"));
  expect([finalists!.from, finalists!.to, finalists!.fps]).toEqual([
    at("20:01:24") + 1000,
    at("20:01:24") + 30_000,
    2,
  ]);
});

test("the field moment follows round one, wherever the final happens to be", () => {
  const fields = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "field");
  expect(fields.map((m) => [m.roundIndex, m.at, m.from, m.to, m.fps])).toEqual([
    [0, at("20:00:44"), at("20:00:44") + 1000, at("20:00:44") + 30_000, 5],
  ]);
});

// The board that follows round one is the whole field while it still reads REMAIN and the
// qualifiers once it settles. Two moments over it meant opening the same 4K footage twice.
test("round one's board is one pass, filed as the field and as the board both", () => {
  const moments = momentsIn(parseLog(SHOW), DATE).filter((m) => m.roundIndex === 0);
  expect(moments.map((m) => m.kind)).toEqual(["first", "field"]);
  expect(moments.find((m) => m.kind === "field")!.also).toEqual(["finalists"]);
});

test("a later round's board is only ever the board", () => {
  const board = momentsIn(parseLog(THREE_ROUND_SHOW), DATE).find((m) => m.roundIndex === 1 && m.kind === "finalists");
  expect(board!.also).toBeUndefined();
});

test("no field moment until the round after it loads, so its stamp has stopped moving", () => {
  // `ends[0]` is the last result so far: mid-round it walks forward with every qualifier, and a
  // moment captured off it would be aimed at the level rather than the board.
  const midRound = SHOW.split("\n").slice(0, 5).join("\n");
  expect(momentsIn(parseLog(midRound), DATE).filter((m) => m.kind === "field")).toEqual([]);
});

test("the winner moment comes off the victory scene", () => {
  const [winner] = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "winner");
  expect(winner!.roundIndex).toBeUndefined();
  expect([winner!.at, winner!.from, winner!.to, winner!.fps]).toEqual([
    at("20:01:35"),
    at("20:01:35") + 2000,
    at("20:01:35") + 20_000,
    2,
  ]);
});

test("a one-round show has no finalists moment", () => {
  const moments = momentsIn(
    parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
`),
    DATE,
  );
  expect(moments.filter((m) => m.kind === "finalists")).toEqual([]);
});

test("a show still being played yields no clip", () => {
  expect(
    showClips(
      parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
`),
      DATE,
    ),
  ).toEqual([]);
});

test("a won show is clipped from its first round to past the victory scene", () => {
  const [clip] = showClips(parseLog(SHOW), DATE);
  expect([clip!.showIndex, clip!.from, clip!.to]).toEqual([
    0,
    at("20:00:05") - 5000,
    at("20:01:35") + 15000,
  ]);
});

test("a show with no victory scene is clipped to past its last result", () => {
  const [clip] = showClips(
    parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is a IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:44.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:05:00.000: [HandleSuccessfulLogin] Selected show is b IsUltimatePartyEpisode: False
`),
    DATE,
  );
  expect([clip!.showIndex, clip!.from, clip!.to]).toEqual([
    0,
    at("20:00:05") - 5000,
    at("20:00:44") + 15000,
  ]);
});

test("a moment's key is stable and tells the three kinds apart", () => {
  const moments = momentsIn(parseLog(SHOW), DATE);
  const keys = moments.map(momentKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain(`${STAMP}:first:1`);
  expect(keys).toContain(`${STAMP}:winner:-`);
});

test("a ledger key names the day, so a later event does not read as already captured", () => {
  const shows = parseLog(SHOW);
  const mine = momentKey(momentsIn(shows, DATE)[0]!);
  expect(mine).toStartWith(`${DATE}T`);
  expect(momentKey(momentsIn(shows, "2026-09-12")[0]!)).not.toBe(mine);
});

test("a clip key names the show the same way a moment's does", () => {
  const [clip] = showClips(parseLog(SHOW), DATE);
  expect(clipKey(clip!)).toBe(`${STAMP}:clip`);
});

test("a moment's key is the prefix of the folder its frames land in", () => {
  const shows = parseLog(SHOW);
  const [show] = showsOnDisk(shows, DATE);
  expect(show!.dir).toStartWith(`show-${momentKey(momentsIn(shows, DATE)[0]!).split(":")[0]}-`);
});

// The bug this key format exists for: Fall Guys rotates `Player.log` on launch, so the parse
// starts again from show 0 and every entry the old show 0 wrote is read as the new one's.
test("a game restart that renumbers the shows leaves their keys alone", () => {
  const second = momentsIn(parseLog(`${EARLIER_SHOW}${SHOW}`), DATE).filter((m) => m.showIndex === 1);
  const rotated = momentsIn(parseLog(SHOW), DATE);
  expect(second.map(momentKey)).toEqual(rotated.map(momentKey));
  expect(second.map(momentKey)).not.toContain(
    momentKey(momentsIn(parseLog(EARLIER_SHOW), DATE)[0]!),
  );
});

test("a clip key survives the same renumbering", () => {
  const [second] = showClips(parseLog(`${EARLIER_SHOW}${SHOW}`), DATE).filter(
    (clip) => clip.showIndex === 1,
  );
  expect(clipKey(second!)).toBe(clipKey(showClips(parseLog(SHOW), DATE)[0]!));
});

test("a show whose first round has not loaded has no identity yet, so it yields nothing", () => {
  const unloaded = `
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;
  expect(momentsIn(parseLog(unloaded), DATE)).toEqual([]);
  expect(showClips(parseLog(unloaded), DATE)).toEqual([]);
});

test("every moment carries the round number its file will be named for", () => {
  const moments = momentsIn(parseLog(SHOW), DATE);
  expect(moments.map((m) => [m.kind, m.roundNumber])).toEqual([
    ["first", 1],
    ["field", 1],
    ["first", 2],
    ["winner", 2],
  ]);
});

test("in a three-round show, finalists sits on the round before the final and winner on the final", () => {
  const moments = momentsIn(parseLog(THREE_ROUND_SHOW), DATE);
  expect(moments.map((m) => [m.kind, m.roundNumber])).toEqual([
    ["first", 1],
    ["field", 1],
    ["first", 2],
    ["finalists", 2],
    ["first", 3],
    ["winner", 3],
  ]);
});

test("the ledger's key does not change, so nothing already captured is pulled twice", () => {
  const [first] = momentsIn(parseLog(SHOW), DATE);
  expect(momentKey(first!)).toBe(`${STAMP}:first:0`);
});

// Volleyfall, 2026-09-04: seven qualified and seven went out on the same tick, and the pass over
// that window decoded all 315 frames of it twice for nothing while the board waited behind it.
const ALL_AT_ONCE = `
20:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
20:00:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
20:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:00:44.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:01:00.000: [StateGameLoading] Finished loading game level, assumed to be round_two. Duration: 1s
20:01:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:01:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=False
20:02:00.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1s
20:02:30.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:02:32.000: ClientGameManager::HandleServerPlayerProgress PlayerId=3 is succeeded=False
20:02:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

test("a round whose whole result set landed on one tick yields no first moment", () => {
  const moments = momentsIn(parseLog(ALL_AT_ONCE), DATE);
  expect(moments.filter((m) => m.kind === "first").map((m) => m.roundNumber)).toEqual([1, 3]);
});

test("the board of a round that qualified nobody individually is still captured", () => {
  const board = momentsIn(parseLog(ALL_AT_ONCE), DATE).find((m) => m.kind === "finalists");
  expect([board!.roundNumber, board!.at]).toEqual([2, at("20:01:40")]);
});
