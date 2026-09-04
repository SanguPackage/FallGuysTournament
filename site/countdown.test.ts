import { expect, test } from "bun:test";
import type { TournamentEvent } from "../src/types";
import { countdownClock, renderCountdown, split } from "./countdown";

const START = "2026-09-05T14:00:00+02:00";
const END = "2026-09-05T19:00:00+02:00";
const AT = (iso: string): number => new Date(iso).getTime();

function event(extra: Partial<TournamentEvent> = {}): TournamentEvent {
  return { name: "FOM 2026", date: "2026-09-05", shows: [], penalties: [], startsAt: START, endsAt: END, ...extra };
}

test("a whole day and change is split into its units", () => {
  expect(split(((26 * 60 + 3) * 60 + 9) * 1000)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 9 });
});

test("time already gone counts nothing down", () => {
  expect(split(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test("the days unit is left off until there is a day to wait", () => {
  expect(countdownClock(23 * 3600 * 1000)).not.toContain("days");
  expect(countdownClock(25 * 3600 * 1000)).toContain("days");
});

test("minutes and seconds are padded, so the clock never jumps a column wide", () => {
  expect(countdownClock(9000)).toContain(">09<");
});

test("the panel counts down to the start", () => {
  const html = renderCountdown(event(), AT("2026-09-05T12:00:00+02:00"));
  expect(html).toContain("countdown");
  expect(html).toContain(">02<");
});

test("the panel names the day and the hours in Belgian time", () => {
  const html = renderCountdown(event(), AT("2026-09-04T10:00:00+02:00"));
  expect(html).toContain("Saturday 5 September");
  expect(html).toContain("14:00");
  expect(html).toContain("19:00");
});

test("the panel points at the Discord and the role to add", () => {
  const html = renderCountdown(event(), AT("2026-09-04T10:00:00+02:00"));
  expect(html).toContain("https://discord.gg/J8msxSh6v");
  expect(html).toContain("Fall Guys");
});

test("the panel carries the moment it counts to, so the ticker needs nothing else", () => {
  expect(renderCountdown(event(), AT("2026-09-04T10:00:00+02:00"))).toContain(`data-starts="${START}"`);
});

test("the panel is gone once the start has passed", () => {
  expect(renderCountdown(event(), AT("2026-09-05T14:00:00+02:00"))).toBe("");
});

test("an early start takes the panel down before its hour", () => {
  const started = event({ shows: [{ name: "Show 1", rounds: [] }] });
  expect(renderCountdown(started, AT("2026-09-05T13:00:00+02:00"))).toBe("");
});

test("an event with no hour set shows no countdown", () => {
  expect(renderCountdown(event({ startsAt: undefined }), AT("2026-09-04T10:00:00+02:00"))).toBe("");
});
