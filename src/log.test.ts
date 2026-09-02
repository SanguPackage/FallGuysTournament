import { expect, test } from "bun:test";
import { logDate, parseLog } from "./log";

const SHOW = `
20:25:00.656: [Matchmaking] [StatePrivateLobby] Send Start Match Command - players in queued reached: 4 players
20:25:02.406: [HandleSuccessfulLogin] Selected show is event_only_finals_v3_template IsUltimatePartyEpisode: False
20:25:05.138: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1.96s
20:25:05.760: [ClientGameManager] Handling bootstrap for local player FallGuy [31] (FG.Common.MPGNetObject), playerID = 1, squadID = 0
20:25:20.615: ClientGameManager::HandleServerPlayerProgress PlayerId=4 is succeeded=False
20:25:20.616: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:25:20.624: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
20:25:20.624: ClientGameManager::HandleServerPlayerProgress PlayerId=3 is succeeded=True
20:25:39.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1.2s
20:26:05.219: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=False
20:27:12.803: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=False
20:27:12.803: ClientGameManager::HandleServerPlayerProgress PlayerId=3 is succeeded=True
20:27:15.840: VictoryScene::winnerPlayerId:3 squadId:0 teamId:-1
`;

test("a show is read with its id and lobby size", () => {
  const [show] = parseLog(SHOW);
  expect(show!.showId).toBe("event_only_finals_v3_template");
  expect(show!.players).toBe(4);
});

test("rounds are read in order, by round id", () => {
  const [show] = parseLog(SHOW);
  expect(show!.rounds.map((round) => round.id)).toEqual([
    "first_round_normal",
    "round_floor_fall_final",
  ]);
});

test("a round records who qualified, in finish order, and who went out", () => {
  const [round] = parseLog(SHOW)[0]!.rounds;
  expect(round!.qualified).toEqual([1, 2, 3]);
  expect(round!.eliminated).toEqual([4]);
});

test("a round records everyone who started it", () => {
  const show = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:02.000: [ClientGameManager] Handling bootstrap for remote player FallGuy [2] (x), playerID = 2, squadID = 0
20:00:03.000: [ClientGameManager] Handling bootstrap for local player FallGuy [3] (x), playerID = 1, squadID = 0
`)[0]!;
  expect(show.rounds[0]!.present).toEqual([1, 2]);
});

test("the referee's own id is read from the local player line", () => {
  expect(parseLog(SHOW)[0]!.localPlayerId).toBe(1);
});

test("the winner is read from the victory screen", () => {
  expect(parseLog(SHOW)[0]!.winnerId).toBe(3);
});

test("the last round of a show is its final", () => {
  const show = parseLog(SHOW)[0]!;
  expect(show.rounds.map((round) => round.isFinal)).toEqual([false, true]);
});

test("a round nobody qualifies from is a timeout", () => {
  const show = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:02.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=False
`)[0]!;
  expect(show.rounds[0]!.timedOut).toBe(true);
});

test("a UGC round still counts, having no scene line of its own", () => {
  const show = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [RoundLoader] Load UGC via share code: 3298-6726-4118:33
20:00:02.000: [StateGameLoading] Finished loading game level, assumed to be ugc_round_normal. Duration: 1s
`)[0]!;
  expect(show.rounds.map((round) => round.id)).toEqual(["ugc_round_normal"]);
});

test("several shows in one log are kept apart", () => {
  const shows = parseLog(`${SHOW}
20:30:00.000: [HandleSuccessfulLogin] Selected show is pl_solo_main_show IsUltimatePartyEpisode: False
20:30:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:30:02.000: VictoryScene::winnerPlayerId:2 squadId:0 teamId:-1
`);
  expect(shows.map((show) => show.showId)).toEqual([
    "event_only_finals_v3_template",
    "pl_solo_main_show",
  ]);
  expect(shows[1]!.winnerId).toBe(2);
});

test("lines before any show are ignored", () => {
  expect(parseLog("20:00:00.000: [Global] nothing to see\n")).toEqual([]);
});

test("a show is stamped with the time it was selected", () => {
  expect(parseLog(SHOW)[0]!.startedAt).toBe("20:25:02");
});

test("each round is stamped with the time it finished loading", () => {
  expect(parseLog(SHOW)[0]!.rounds.map((round) => round.startedAt)).toEqual([
    "20:25:05",
    "20:25:39",
  ]);
});

test("a line without a timestamp leaves the stamp off rather than guessing", () => {
  const [show] = parseLog(
    "[HandleSuccessfulLogin] Selected show is solos IsUltimatePartyEpisode: False\n",
  );
  expect(show!.startedAt).toBeUndefined();
});

test("the win is stamped with the time the victory scene came up", () => {
  expect(parseLog(SHOW)[0]!.wonAt).toBe("20:27:15");
});

test("a round carries the name and type its level id resolves to", () => {
  const show = parseLog(`20:00:00.000: [HandleSuccessfulLogin] Selected show is show_solos
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be round_tail_tag_solos. Duration: 1s
20:00:02.000: [StateGameLoading] Finished loading game level, assumed to be round_wall_guys_solos. Duration: 1s
20:00:03.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_only_finals_v2_final. Duration: 1s
`)[0]!;
  expect(show.rounds.map((round) => [round.name, round.type])).toEqual([
    ["Tail Tag", "hunt"],
    ["Wall Guys", "race"],
    ["Hex-A-Gone", "final"],
  ]);
});

/**
 * Rounds arrive one at a time, so the round on screen is always the last one on the list. Calling
 * it the final while the show is still being played turns the opener into a final, which takes the
 * first-place field away from a round that scores one.
 */
test("the round being played now is not the final just for being last", () => {
  const show = parseLog(`20:00:00.000: [HandleSuccessfulLogin] Selected show is show_solos
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be knockout_mindthegap_opener. Duration: 1s
`)[0]!;
  expect(show.rounds[0]!.isFinal).toBe(false);
  expect(show.rounds[0]!.type).toBe("unknown");
});

test("the last round is the final once the victory scene has named a winner", () => {
  const show = parseLog(`20:00:00.000: [HandleSuccessfulLogin] Selected show is show_solos
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be knockout_mindthegap_opener. Duration: 1s
20:00:40.000: VictoryScene::winnerPlayerId:3 squadId:0 teamId:-1
`)[0]!;
  expect(show.rounds[0]!.isFinal).toBe(true);
  expect(show.rounds[0]!.type).toBe("final");
});

test("the last round is the final once the lobby has moved on to another show", () => {
  const [first] = parseLog(`20:00:00.000: [HandleSuccessfulLogin] Selected show is show_a
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be knockout_mindthegap_opener. Duration: 1s
20:10:00.000: [HandleSuccessfulLogin] Selected show is show_b
20:10:01.000: [StateGameLoading] Finished loading game level, assumed to be knockout_mindthegap_opener. Duration: 1s
`);
  expect(first!.rounds[0]!.isFinal).toBe(true);
});

test("a round the table calls a final is one from the moment it loads", () => {
  const show = parseLog(`20:00:00.000: [HandleSuccessfulLogin] Selected show is show_solos
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be round_fall_mountain_hub_complete. Duration: 1s
`)[0]!;
  expect(show.rounds[0]!.isFinal).toBe(true);
});

test("a round is stamped with the last result the server reported", () => {
  expect(parseLog(SHOW)[0]!.rounds.map((round) => round.endedAt)).toEqual([
    "20:25:20",
    "20:27:12",
  ]);
});

test("a round records when its first qualifier came in, not its first result", () => {
  // The elimination lands a second before the first qualifier, so a stamp taken off any progress
  // line rather than a qualifying one reads 20:00:09.
  const show = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:09.000: ClientGameManager::HandleServerPlayerProgress PlayerId=4 is succeeded=False
20:00:10.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
20:00:11.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=True
`)[0]!;
  expect(show.rounds[0]!.firstQualifiedAt).toBe("20:00:10");
});

test("a round nobody qualified from records no first", () => {
  const show = parseLog(`
20:00:00.000: [HandleSuccessfulLogin] Selected show is s IsUltimatePartyEpisode: False
20:00:01.000: [StateGameLoading] Finished loading game level, assumed to be r. Duration: 1s
20:00:09.000: ClientGameManager::HandleServerPlayerProgress PlayerId=2 is succeeded=False
`)[0]!;
  expect(show.rounds[0]!.firstQualifiedAt).toBeUndefined();
});

test("the log's day is the UTC day its clock stamps belong to", () => {
  const dated = `
20:52:06.410: 2026-09-02T22:52:00.576 NativePlugin (INFORM): about to look with exists
20:52:07.000: [Matchmaking] Send Start Match Command - players in queued reached: 4 players
`;
  expect(logDate(dated)).toBe("2026-09-02");
});

test("a session started after local midnight still reads as the UTC day before", () => {
  expect(logDate("22:30:05.000: 2026-09-03T00:30:00.000 NativePlugin (INFORM): x\n")).toBe(
    "2026-09-02",
  );
});

test("a zone behind UTC rolls the day forward", () => {
  expect(logDate("03:30:02.000: 2026-09-02T22:30:00.000 NativePlugin (INFORM): x\n")).toBe(
    "2026-09-03",
  );
});

test("a log with no dated line has no day", () => {
  expect(logDate(SHOW)).toBeUndefined();
});
