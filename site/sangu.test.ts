import { expect, test } from "bun:test";
import { levelIcon, levelLink, sanguMark } from "./sangu";

test("a map with clips on sangu.be links to them", () => {
  expect(levelLink("Big Fans")).toContain(`href="https://sangu.be/fallguys/levels/big-fans"`);
});

test("punctuation in a map name falls out of its slug rather than becoming a hyphen", () => {
  expect(levelLink("Stompin' Ground")).toContain("/levels/stompin-ground");
  expect(levelLink("Hex-A-Gone")).toContain("/levels/hex-a-gone");
});

test("a map sangu.be has no page for is left unlinked", () => {
  expect(levelLink("Starchart")).toBe("");
});

test("a link out carries the same mark as the one in the footer", () => {
  expect(levelLink("Thin Ice")).toContain(sanguMark());
});

test("a map is drawn with the game's own icon for it", () => {
  expect(levelIcon("Big Fans")).toContain(`src="./img/levels/big-fans-icon.png"`);
});

test("an icon is decoration: the name beside it already says which map", () => {
  expect(levelIcon("Big Fans")).toContain(`alt=""`);
});

test("a map with no icon downloaded is drawn without one", () => {
  expect(levelIcon("Wouter's Kitchen")).toBe("");
});
