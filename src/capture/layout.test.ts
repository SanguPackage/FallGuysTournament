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
