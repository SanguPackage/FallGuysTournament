import { expect, test } from "bun:test";
import type { Player, Show } from "../src/types";
import { renderShowField } from "./show-field";

const ROSTER: Player[] = [
  { fom: "Alpha_FOM", ingame: "Alpha" },
  { fom: "Bravo_FOM", ingame: "Bravo" },
  { fom: "Charlie_FOM", ingame: "Charlie" },
];

const FINISHED: Show = {
  name: "Solos",
  rounds: [
    { map: "Dizzy Heights", type: "race", first: "Alpha", qualified: ["Alpha", "Bravo"] },
    { map: "Fall Mountain", type: "final" },
  ],
  winners: ["Alpha"],
};

test("every player in the field gets a chip", () => {
  const html = renderShowField(FINISHED, ROSTER);
  expect(html).toContain("Alpha");
  expect(html).toContain("Bravo");
  expect(html).toContain("Charlie");
});

test("a chip carries its state as a class", () => {
  const html = renderShowField(FINISHED, ROSTER);
  expect(html).toContain(`class="bn won"`);
  expect(html).toContain(`class="bn through"`);
  expect(html).toContain(`class="bn out"`);
});

test("a knocked-out chip says which round did it", () => {
  expect(renderShowField(FINISHED, ROSTER)).toContain("out R1");
});

test("rounds crossed first are marked on the chip", () => {
  expect(renderShowField(FINISHED, ROSTER)).toContain("⚡1");
});

test("an empty roster renders nothing", () => {
  expect(renderShowField(FINISHED, [])).toBe("");
});

test("a name is escaped", () => {
  const html = renderShowField(FINISHED, [{ fom: "X", ingame: "<script>" }]);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});
