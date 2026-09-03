// Folder names are built from the local clock, so these must not run in UTC.
process.env.TZ = "Europe/Brussels";

import { expect, test } from "bun:test";
import { captureFile } from "./layout";

test("a capture is named for its round and what it shows", () => {
  expect(captureFile("first", 1, 1)).toBe("round-01-first-race-finisher-01.jpg");
  expect(captureFile("finalists", 3, 2)).toBe("round-03-finalists-board-02.jpg");
  expect(captureFile("field", 1, 5)).toBe("round-01-whole-field-05.jpg");
});

test("the winner screen is filed under the final's number, like everything else", () => {
  expect(captureFile("winner", 4, 1)).toBe("round-04-winner-01.jpg");
});

test("a show long enough to run past nine rounds still sorts", () => {
  expect(captureFile("first", 12, 1)).toBe("round-12-first-race-finisher-01.jpg");
});

import { showFolder, slugOf } from "./layout";
import { parseLog } from "../log";

const LOG = `
23:25:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
23:25:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
23:25:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
23:26:00.000: [StateGameLoading] Finished loading game level, assumed to be round_floor_fall_final. Duration: 1s
23:26:30.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
23:26:35.000: VictoryScene::winnerPlayerId:1 squadId:0 teamId:-1
`;

test("a show folder carries the day, the clock it started on and its name", () => {
  const at = new Date(2026, 8, 2, 23, 25, 5).getTime();
  expect(showFolder(at, "playlist-a-1")).toBe("show-2026-09-02T23h25-playlist-a-1");
});

test("a show that started after midnight is named for the day it actually started", () => {
  const at = new Date(2026, 8, 3, 0, 29, 12).getTime();
  expect(showFolder(at, "solos-5")).toBe("show-2026-09-03T00h29-solos-5");
});

test("a slug is the suggested show name, lowercased and hyphenated", () => {
  expect(slugOf(parseLog(LOG), 0)).toBe("playlist-a-1");
});

import { showsOnDisk } from "./layout";

const DATE = "2026-09-02";
const utc = (clock: string) => Date.parse(`${DATE}T${clock}Z`);

const TWO_SHOWS = `
21:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
21:00:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
21:00:40.000: ClientGameManager::HandleServerPlayerProgress PlayerId=1 is succeeded=True
21:05:00.000: [HandleSuccessfulLogin] Selected show is playlist_b IsUltimatePartyEpisode: False
21:05:05.000: [StateGameLoading] Finished loading game level, assumed to be first_round_normal. Duration: 1s
`;

test("each show that has loaded a round owns a folder, named for that round's clock", () => {
  const folders = showsOnDisk(parseLog(TWO_SHOWS), DATE);
  expect(folders.map((show) => [show.showIndex, show.dir])).toEqual([
    [0, showFolder(utc("21:00:05"), "playlist-a-1")],
    [1, showFolder(utc("21:05:05"), "playlist-b-1")],
  ]);
});

test("a show's window runs from its own start to the next show's, so its header lines are in it", () => {
  const [first, second] = showsOnDisk(parseLog(TWO_SHOWS), DATE);
  expect([first!.from, first!.to]).toEqual([utc("21:00:00"), utc("21:05:00")]);
  expect(second!.from).toBe(utc("21:05:00"));
});

test("the show still being played has no end to close its window at", () => {
  const folders = showsOnDisk(parseLog(TWO_SHOWS), DATE);
  expect(folders.at(-1)!.to).toBe(Infinity);
});

test("a show that has loaded no round yet has nothing to name a folder after", () => {
  const selected = `
21:00:00.000: [HandleSuccessfulLogin] Selected show is playlist_a IsUltimatePartyEpisode: False
`;
  expect(showsOnDisk(parseLog(selected), DATE)).toEqual([]);
});
