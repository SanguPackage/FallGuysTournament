import { expect, test } from "bun:test";
import { finalistsOf, identify } from "./rounds";
import type { Show } from "./types";

test("a round played straight from the base id is named and typed", () => {
  expect(identify("round_wall_guys")).toEqual({ name: "Wall Guys", type: "race" });
});

test("the variant suffix the log writes is matched back to the base round", () => {
  expect(identify("round_wall_guys_solos")).toEqual({ name: "Wall Guys", type: "race" });
  expect(identify("round_hexsnake_40_pl")).toEqual({ name: "Hex-A-Terrestrial", type: "survival" });
});

test("a longer id wins over the shorter one it starts with", () => {
  expect(identify("round_hoverboardsurvival_solos").name).toBe("Hoverboard Heroes");
  expect(identify("round_hoverboardsurvival2_almond").name).toBe("Hyperdrive Heroes");
});

test("tail tag is a hunt round, not the race the log's position would suggest", () => {
  expect(identify("round_tail_tag_solos")).toEqual({ name: "Tail Tag", type: "hunt" });
});

test("creative rounds come through with their own names", () => {
  expect(identify("wle_s10_orig_round_001")).toEqual({ name: "Beans Ahoy!", type: "race" });
});

test("an id in no table keeps its raw name, so the admin sees what to type instead", () => {
  expect(identify("cloudyteacupsgoldrush_only_finals_v3_normal")).toEqual({
    name: "cloudyteacupsgoldrush_only_finals_v3_normal",
    type: "unknown",
  });
});

test("finalistsOf reads the board after the round before the final", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
      { map: "Fall Mountain", type: "final" },
    ],
  };
  expect(finalistsOf(show)).toEqual(["Alpha", "Bravo"]);
});

test("a show whose final has not been played yet has no finalists", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Dizzy Heights", type: "race", qualified: ["Alpha", "Bravo", "Charlie"] },
      { map: "Roll Out", type: "survival", qualified: ["Alpha", "Bravo"] },
    ],
  };
  expect(finalistsOf(show)).toEqual([]);
});

test("finalistsOf gives nothing when the semi's board was never read", () => {
  const show: Show = {
    name: "Solos",
    rounds: [
      { map: "Roll Out", type: "survival" },
      { map: "Fall Mountain", type: "final" },
    ],
  };
  expect(finalistsOf(show)).toEqual([]);
});

test("a show that is only a final has no round to hang finalists off", () => {
  const show: Show = { name: "Solos", rounds: [{ map: "Fall Mountain", type: "final" }] };
  expect(finalistsOf(show)).toEqual([]);
});
