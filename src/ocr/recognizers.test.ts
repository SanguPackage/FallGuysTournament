import { expect, test } from "bun:test";
import { frameFrom } from "./frame";
import { identify, type Screen } from "./recognizers";

test("each sample is recognised as the screen it is", async () => {
  const cases: [string, Screen | undefined][] = [
    ["grid-15.jpg", "grid"],
    ["grid-9.jpg", "grid"],
    ["grid-5.jpg", "grid"],
    ["winner.jpg", "winner"],
    ["toast.jpg", "toast"],
  ];
  for (const [file, screen] of cases) {
    expect(identify(await frameFrom(`src/ocr/samples/${file}`))).toBe(screen);
  }
});

test("the lobby is covered in names and is still not a screen we read", async () => {
  expect(identify(await frameFrom("src/ocr/samples/lobby.jpg"))).toBeUndefined();
});

/**
 * Frames pulled out of a recording are mostly the round being played, so anything that reads a
 * level as a screen worth reading is what the whole feature gets wrong.
 */
test("a round being played is no screen at all, however green or gold the level is", async () => {
  for (const file of ["playing-scenery.jpg", "playing-nametags.jpg", "eliminated.jpg"]) {
    expect(identify(await frameFrom(`src/ocr/samples/${file}`))).toBeUndefined();
  }
});
