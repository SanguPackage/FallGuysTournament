import { expect, test } from "bun:test";
import type { ShowInOrder } from "../site/rules";
import { liveStatus, withLiveLog } from "./live";
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

test("the show number counts shows played, not the position in the order", () => {
  const status = liveStatus(
    event([
      { name: "Solos", rounds: [], winners: ["Alpha"] },
      { name: "Roll Call", rounds: [] },
    ]),
    ORDER,
  );
  expect(status.showNumber).toBe(2);
  expect(status.orderIndex).toBe(2);
});

test("after the last show in the order there is nothing up next", () => {
  const status = liveStatus(
    event([{ name: "Roll Call", rounds: [], winners: ["Alpha"] }]),
    ORDER,
  );
  expect(status.nextShow).toBeUndefined();
});

test("a replayed show the order does not list leaves the pips unanchored", () => {
  const status = liveStatus(event([{ name: "Some Replay", rounds: [] }]), ORDER);
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

test("a show the order does not list leaves the pips unanchored", () => {
  const live = withLiveLog(liveStatus(event([]), ORDER), { ...NOW, show: "Some Replay" }, ORDER);
  expect(live.orderIndex).toBe(-1);
  expect(live.nextShow).toBeUndefined();
});
