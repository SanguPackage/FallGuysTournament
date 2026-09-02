import { expect, test } from "bun:test";
import type { ShowInOrder } from "../site/rules";
import { liveStatus, mergeLive, showNameNow, withLiveLog, type LiveNow } from "./live";
import type { Round, Show, TournamentEvent } from "./types";

const ORDER: ShowInOrder[] = [
  { position: 1, show: "Solos", tier: "Opening", min: 2, max: 32 },
  { position: 2, show: "Fan Favourites", tier: "Opening", min: 5, max: 32 },
  { position: 3, show: "Roll Call", tier: "Advanced", min: 5, max: 32 },
];

function event(shows: Show[]): TournamentEvent {
  return { name: "FOM", date: "2026-09-01", shows, penalties: [] };
}

function race(map: string): Round {
  return { map, type: "race", first: "Alpha" };
}

test("before the first show the next show is the first in the order", () => {
  const status = liveStatus(event([]), ORDER);
  expect(status.state).toBe("not-started");
  expect(status.nextShow).toBe("Solos");
  expect(status.showName).toBeUndefined();
});

test("a show with rounds recorded is playing the round after the last one", () => {
  const status = liveStatus(event([{ name: "Solos", rounds: [race("Dizzy Heights")] }]), ORDER);
  expect(status.state).toBe("playing");
  expect(status.showName).toBe("Solos");
  expect(status.showNumber).toBe(1);
  expect(status.round).toBe(2);
  expect(status.lastRound?.map).toBe("Dizzy Heights");
  expect(status.nextShow).toBe("Fan Favourites");
});

test("a show that has just started is on round one with no last round", () => {
  const status = liveStatus(event([{ name: "Solos", rounds: [] }]), ORDER);
  expect(status.round).toBe(1);
  expect(status.lastRound).toBeUndefined();
});

test("a show with winners is over, so the next show is up", () => {
  const status = liveStatus(
    event([{ name: "Solos", rounds: [race("Dizzy Heights")], winners: ["Alpha"] }]),
    ORDER,
  );
  expect(status.state).toBe("between");
  expect(status.round).toBeUndefined();
  expect(status.nextShow).toBe("Fan Favourites");
});

test("the plan is followed by how many shows have been played, whatever they are called", () => {
  const status = liveStatus(
    event([
      { name: "Solos 1", rounds: [], winners: ["Alpha"] },
      { name: "Solos 2", rounds: [] },
    ]),
    ORDER,
  );
  expect(status.showNumber).toBe(2);
  expect(status.orderIndex).toBe(1);
  expect(status.nextShow).toBe("Roll Call");
});

test("after the last show in the order there is nothing up next", () => {
  const status = liveStatus(
    event([
      { name: "Solos 1", rounds: [], winners: ["Alpha"] },
      { name: "Solos 2", rounds: [], winners: ["Alpha"] },
      { name: "Solos 3", rounds: [], winners: ["Alpha"] },
    ]),
    ORDER,
  );
  expect(status.orderIndex).toBe(2);
  expect(status.nextShow).toBeUndefined();
});

test("playing past the end of the plan leaves the pips unanchored", () => {
  const played = [1, 2, 3, 4].map((n) => ({ name: `Solos ${n}`, rounds: [] }));
  const status = liveStatus(event(played), ORDER);
  expect(status.orderIndex).toBe(-1);
  expect(status.nextShow).toBeUndefined();
});

const NOW = {
  show: "Fan Favourites",
  showNumber: 2,
  round: 3,
  map: "Hex-A-Terrestrial",
  type: "survival" as const,
  startedAt: "21:04:11",
  rounds: [
    { map: "Wall Guys", type: "race" as const, qualified: 14 },
    { map: "Tip Toe", type: "race" as const, qualified: 9 },
    { map: "Hex-A-Terrestrial", type: "survival" as const },
  ],
};

test("without the log the status is whatever was recorded", () => {
  const status = liveStatus(event([{ name: "Solos", rounds: [race("Dizzy Heights")] }]), ORDER);
  expect(withLiveLog(status, null, ORDER)).toEqual(status);
});

test("the log says what is on screen, ahead of anything saved", () => {
  const status = liveStatus(event([{ name: "Solos", rounds: [], winners: ["Alpha"] }]), ORDER);
  const live = withLiveLog(status, NOW, ORDER);
  expect(live.state).toBe("playing");
  expect(live.showName).toBe("Fan Favourites");
  expect(live.showNumber).toBe(2);
  expect(live.round).toBe(3);
});

test("the round on screen is named and typed before a single score is entered", () => {
  const live = withLiveLog(liveStatus(event([]), ORDER), NOW, ORDER);
  expect(live.lastRound).toEqual({ map: "Hex-A-Terrestrial", type: "survival" });
  expect(live.roundLive).toBe(true);
});

test("the pips and what is up next follow the show the log reports", () => {
  const live = withLiveLog(liveStatus(event([]), ORDER), NOW, ORDER);
  expect(live.orderIndex).toBe(1);
  expect(live.nextShow).toBe("Roll Call");
});

test("a show still loading its first round keeps the last recorded round on screen", () => {
  const status = liveStatus(event([{ name: "Solos", rounds: [race("Dizzy Heights")] }]), ORDER);
  const live = withLiveLog(status, { ...NOW, round: 0, map: null, type: null }, ORDER);
  expect(live.lastRound?.map).toBe("Dizzy Heights");
  expect(live.roundLive).toBe(false);
});

test("a show past the end of the plan leaves the pips unanchored", () => {
  const live = withLiveLog(liveStatus(event([]), ORDER), { ...NOW, showNumber: 4 }, ORDER);
  expect(live.orderIndex).toBe(-1);
  expect(live.nextShow).toBeUndefined();
});

test("a show that has been recorded is called whatever it was recorded as", () => {
  const recorded = event([{ name: "Solos 1", rounds: [] }, { name: "Solos 2", rounds: [] }]);
  expect(showNameNow(recorded, 1, "Day at the Races Solo 1")).toBe("Solos 2");
});

test("a rename keeps, because the name is read back every time", () => {
  const renamed = event([{ name: "The Rematch", rounds: [] }]);
  expect(showNameNow(renamed, 0, "Solos 1")).toBe("The Rematch");
});

test("finishing a show does not hand its name back to the log", () => {
  const won = event([{ name: "Solos 1", rounds: [], winners: ["Alpha"] }]);
  expect(showNameNow(won, 0, "Solos 2")).toBe("Solos 1");
});

test("a show nobody has written down yet goes by what the log calls it", () => {
  expect(showNameNow(event([]), 0, "Solos 1")).toBe("Solos 1");
  expect(showNameNow(event([{ name: "  ", rounds: [] }]), 0, "Solos 1")).toBe("Solos 1");
});

const LOG: LiveNow = {
  show: "Solos 2",
  showNumber: 2,
  round: 3,
  map: "Roll Out",
  type: "race",
  startedAt: "01:27:40",
  rounds: [
    { map: "Wall Guys", type: "race", qualified: 14 },
    { map: "Hoverboard Heroes", type: "survival", qualified: 9 },
    { map: "Roll Out", type: "race" },
  ],
};

test("a show nobody has typed in yet is the log's rounds under the log's name", () => {
  expect(mergeLive(undefined, LOG)).toEqual({
    name: "Solos 2",
    rounds: [
      { map: "Wall Guys", type: "race", survivors: 14 },
      { map: "Hoverboard Heroes", type: "survival", survivors: 9 },
      { map: "Roll Out", type: "race" },
    ],
  });
});

test("what has been recorded wins over the log, round for round", () => {
  const recorded: Show = {
    name: "Grand Final",
    rounds: [{ map: "Wall Guys", type: "hunt", first: "Alpha", qualified: ["Alpha"] }],
  };
  const merged = mergeLive(recorded, LOG);
  expect(merged.name).toBe("Grand Final");
  expect(merged.rounds[0]).toEqual({
    map: "Wall Guys",
    type: "hunt",
    first: "Alpha",
    qualified: ["Alpha"],
    survivors: 14,
  });
});

test("rounds the log has loaded past what is typed in are appended", () => {
  const recorded: Show = { name: "Solos 2", rounds: [{ map: "Wall Guys", type: "race" }] };
  expect(mergeLive(recorded, LOG).rounds.map((round) => round.map)).toEqual([
    "Wall Guys",
    "Hoverboard Heroes",
    "Roll Out",
  ]);
});

test("a recorded count is not overwritten by the log's", () => {
  const recorded: Show = {
    name: "Solos 2",
    rounds: [{ map: "Wall Guys", type: "race", survivors: 13 }],
  };
  expect(mergeLive(recorded, LOG).rounds[0]?.survivors).toBe(13);
});

test("recorded rounds the log never reported keep their place", () => {
  const recorded: Show = {
    name: "Solos 2",
    rounds: [
      { map: "Wall Guys", type: "race" },
      { map: "Hoverboard Heroes", type: "survival" },
      { map: "Roll Out", type: "race" },
      { map: "Hex-A-Gone", type: "final" },
    ],
  };
  expect(mergeLive(recorded, LOG).rounds.map((round) => round.map)).toEqual([
    "Wall Guys",
    "Hoverboard Heroes",
    "Roll Out",
    "Hex-A-Gone",
  ]);
});

test("winners survive the merge", () => {
  const recorded: Show = { name: "Solos 2", rounds: [], winners: ["Alpha"] };
  expect(mergeLive(recorded, LOG).winners).toEqual(["Alpha"]);
});
