import { expect, test } from "bun:test";
import { assign, cleanToken, dropLevel, normalise } from "./match";

const REAL = [
  "BigMooseLips",
  "Darkwin067",
  "Falso_Brasileiro",
  "Crissti_14",
  "pdalhome",
  "boncuk_cat",
  "alexdriv__10",
  "The_Skibidi_Mon",
  "DarkRazou",
  "T800_is_back",
  "rayviSion",
  "Kotsovolis3250",
  "BeatrizGamer_100",
];
const NEAR = ["Crissti_41", "pdalhome2", "DarkRazor", "Skibidi_MonF", "boncuk_dog"];

/** Exactly what Tesseract returned for the five green cards of grid-5.jpg. */
const CARDS = [
  "BigMoosellps . 2:",
  "Darkwin0&7 4",
  "YWHAANTHI (VMAZ ",
  "AIONYIIOX NINA 24",
  "Falso Brasileiro 30",
];

test("the crown's level number is not part of the name", () => {
  expect(dropLevel(cleanToken("BigMoosellps . 2:"))).toBe("BigMoosellps");
  expect(dropLevel(cleanToken("Falso Brasileiro 30"))).toBe("Falso Brasileiro");
});

test("a toast pill wears no crown, so its trailing digits are the name", () => {
  expect(cleanToken("-Serxav 9")).toBe("Serxav 9");
  expect(assign([cleanToken("-Serxav 9")], ["Serxav_9"])[0]!.name).toBe("Serxav_9");
});

test("separators carry no signal, because an underscore reads as a space", () => {
  expect(normalise("Falso Brasileiro")).toBe(normalise("Falso_Brasileiro"));
});

test("every name on the board is matched, with near-misses in the roster", () => {
  const got = assign(CARDS.map((c) => dropLevel(cleanToken(c))), [...REAL, ...NEAR]);
  expect(got.map((m) => m.name)).toEqual([
    "BigMooseLips",
    "Darkwin067",
    undefined,
    undefined,
    "Falso_Brasileiro",
  ]);
});

test("a name the roster does not hold falls through to what was read", () => {
  const [only] = assign(["Newcomer_77"], REAL);
  expect(only!.name).toBeUndefined();
  expect(only!.value).toBe("Newcomer_77");
});

test("two roster names a character apart make the matcher decline, never guess", () => {
  const [only] = assign([dropLevel(cleanToken("Falso Brasileiro 30"))], [...REAL, "Falso_Brasileira"]);
  expect(only!.name).toBeUndefined();
});

test("nobody qualifies twice, so a roster name is used at most once", () => {
  const got = assign(["BigMoosellps", "BigMooseLips"], REAL);
  expect(got.filter((m) => m.name === "BigMooseLips").length).toBe(1);
});

test("a read too rough for the first pass is placed once the pool has thinned", () => {
  const roster = ["mykyel972", "coldgin1974"];
  expect(assign(["La mvkval972"], roster)[0]!.name).toBe("mykyel972");
});

test("the second pass still declines a stranger, which every open lobby is full of", () => {
  const roster = ["Pigbro42", "Rlewy19", "SonicCHTR", "hannahbanana0724"];
  expect(assign(["R Diego_9942"], roster)[0]!.name).toBeUndefined();
  expect(assign(["MiNi CRYPTO"], roster)[0]!.name).toBeUndefined();
  expect(assign(["an A Cann aoat es"], roster)[0]!.name).toBeUndefined();
});

test("a name the first pass claimed is gone from the pool the second pass rescues from", () => {
  const got = assign(["mykyel972", "La mvkval972"], ["mykyel972", "coldgin1974"]);
  expect(got.map((m) => m.name)).toEqual(["mykyel972", undefined]);
});
