import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEvent, loadPlayers, saveEvent } from "./storage";
import type { TournamentEvent } from "./types";

test("an event survives a save and load round trip", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fom-"));
  const path = join(dir, "event.json");
  const event: TournamentEvent = {
    name: "FOM",
    date: "2026-09-01",
    shows: [{ name: "Solos", rounds: [{ map: "Tip Toe", type: "race", first: "Alpha" }] }],
    penalties: [],
  };
  await saveEvent(event, path);
  expect(await loadEvent(path)).toEqual(event);
});

test("the committed data files parse", async () => {
  expect((await loadPlayers()).players.length).toBeGreaterThan(0);
  expect(Array.isArray((await loadEvent()).shows)).toBe(true);
});
