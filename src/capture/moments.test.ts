// The log writes UTC while the event runs on Belgian time, so these must not run in UTC.
process.env.TZ = "Europe/Brussels";

import { expect, test } from "bun:test";
import { parseLog } from "../log";
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
20:01:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

test("every round with a qualifier yields a first moment, windowed around it", () => {
  const firsts = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "first");
  expect(firsts.map((m) => [m.roundIndex, m.at, m.from, m.to, m.fps])).toEqual([
    [0, at("20:00:40"), at("20:00:40") - 500, at("20:00:40") + 10_000, 30],
    [1, at("20:01:30"), at("20:01:30") - 500, at("20:01:30") + 10_000, 30],
  ]);
});

test("the finalists moment follows the round before the final, not the final", () => {
  const [finalists] = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "finalists");
  expect(finalists!.roundIndex).toBe(0);
  expect(finalists!.at).toBe(at("20:00:44"));
  expect([finalists!.from, finalists!.to, finalists!.fps]).toEqual([
    at("20:00:44") + 1000,
    at("20:00:44") + 30_000,
    2,
  ]);
});

test("the field moment follows round one, wherever the final happens to be", () => {
  const fields = momentsIn(parseLog(SHOW), DATE).filter((m) => m.kind === "field");
  expect(fields.map((m) => [m.roundIndex, m.at, m.from, m.to, m.fps])).toEqual([
    [0, at("20:00:44"), at("20:00:44") + 2000, at("20:00:44") + 20_000, 5],
  ]);
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
  expect(keys).toContain(`${DATE}:0:first:1`);
  expect(keys).toContain(`${DATE}:0:winner:-`);
});

test("a ledger key names the event, so a later one does not read as already captured", () => {
  const shows = parseLog(SHOW);
  const mine = momentKey(momentsIn(shows, DATE)[0]!);
  expect(mine).toStartWith(`${DATE}:`);
  expect(momentKey(momentsIn(shows, "2026-09-12")[0]!)).not.toBe(mine);
});

test("a clip key names the event too", () => {
  const [clip] = showClips(parseLog(SHOW), DATE);
  expect(clipKey(clip!)).toBe(`${DATE}:0:clip`);
});
