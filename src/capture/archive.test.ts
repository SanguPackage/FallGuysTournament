import { expect, test } from "bun:test";
import { archiveName, archivedShow, strayArchiveName } from "./archive";
import type { Show } from "../types";

const SHOW: Show = {
  name: "Solos 2",
  rounds: [{ map: "Dizzy Heights", type: "race", first: "Bean" }],
  winners: ["Bean"],
};

test("the first archive in a folder is the plain name", () => {
  expect(archiveName([])).toBe("deleted-show.json");
  expect(archiveName(["round-01-winner-01.jpg"])).toBe("deleted-show.json");
});

test("a second delete into the same folder is numbered rather than overwriting the first", () => {
  expect(archiveName(["deleted-show.json"])).toBe("deleted-show-02.json");
  expect(archiveName(["deleted-show.json", "deleted-show-02.json"])).toBe("deleted-show-03.json");
});

test("numbering counts past a gap left by a hand-deleted archive", () => {
  expect(archiveName(["deleted-show.json", "deleted-show-03.json"])).toBe("deleted-show-04.json");
});

test("a folder holding ten archives keeps sorting", () => {
  const taken = [
    "deleted-show.json",
    ...Array.from({ length: 9 }, (_, at) => `deleted-show-${String(at + 2).padStart(2, "0")}.json`),
  ];
  expect(archiveName(taken)).toBe("deleted-show-11.json");
});

test("a show with no folder of its own is archived under the shows root, named for its slot", () => {
  expect(strayArchiveName("2026-09-04", 1)).toBe("deleted-show-2026-09-04-02.json");
});

test("the archive says which slot the show came out of, since its name need not", () => {
  const at = Date.UTC(2026, 8, 4, 21, 3, 11);
  expect(archivedShow(SHOW, 1, at)).toEqual({
    deletedAt: "2026-09-04T21:03:11.000Z",
    showIndex: 1,
    show: SHOW,
  });
});
