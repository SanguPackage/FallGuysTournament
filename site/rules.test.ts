import { expect, test } from "bun:test";
import { parseShowOrder, renderMarkdown, renderShowOrder } from "./rules";

test("section headings render, and the document title is left to the page", () => {
  const html = renderMarkdown("# Rules\n\n## 1. Registration\n");
  expect(html).not.toContain("<h1>");
  expect(html).toContain("<h2>1. Registration</h2>");
});

test("a paragraph wrapped over several lines becomes one paragraph", () => {
  const html = renderMarkdown("2.1 The tournament is played\nas a solo custom lobby.\n");
  expect(html).toContain("<p>2.1 The tournament is played as a solo custom lobby.</p>");
});

test("blank lines separate paragraphs", () => {
  const html = renderMarkdown("First.\n\nSecond.\n");
  expect(html).toContain("<p>First.</p>");
  expect(html).toContain("<p>Second.</p>");
});

test("a table renders a header row and body rows, without the divider", () => {
  const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n");
  expect(html).toContain("<th>A</th>");
  expect(html).toContain("<td>1</td>");
  expect(html).not.toContain("---");
});

test("markdown tables are marked so prose tables can be styled apart from the leaderboard", () => {
  expect(renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n")).toContain(`<table class="doc">`);
});

test("markup in the source is escaped", () => {
  expect(renderMarkdown("<script>alert(1)</script>\n")).not.toContain("<script>");
});

test("the show order carries each show's player limits", () => {
  const shows = parseShowOrder(SAMPLE);
  expect(shows).toEqual([
    { position: 1, show: "Solos", tier: "Opening", min: 2, max: 32 },
    { position: 2, show: "Roll Call", tier: "Advanced", min: 5, max: 16 },
  ]);
});

test("the scoring table is not mistaken for the show order", () => {
  expect(parseShowOrder("| Achievement | Points |\n|---|---|\n| Winning | 5 |\n")).toEqual([]);
});

test("the show order renders in order with its tiers", () => {
  const html = renderShowOrder(parseShowOrder(SAMPLE));
  expect(html.indexOf("Solos")).toBeLessThan(html.indexOf("Roll Call"));
  expect(html).toContain("Advanced");
});

test("before anything is played every show is upcoming", () => {
  const html = renderShowOrder(parseShowOrder(SAMPLE));
  expect(html).not.toContain("Playing now");
  expect(html).not.toContain("Played");
});

test("the show being played is marked, and the ones before it are done", () => {
  const html = renderShowOrder(parseShowOrder(SAMPLE), 1);
  expect(html).toMatch(/class="o done"[\s\S]*?Solos/);
  expect(html).toMatch(/class="o now"[\s\S]*?Roll Call/);
  expect(html).toContain("Playing now");
});

const SAMPLE = `## 2. Format

| #  | Show      | Tier     | Min | Max |
|----|-----------|----------|-----|-----|
| 1  | Solos     | Opening  | 2   | 32  |
| 2  | Roll Call | Advanced | 5   | 16  |

| Achievement | Points |
|-------------|--------|
| Winning     | 5      |
`;

test("the show order renders each show's player limits", () => {
  const html = renderShowOrder(parseShowOrder(SAMPLE));
  expect(html).toContain("2–32 players");
});

test("the rules table and the fetched wiki limits agree", async () => {
  const rules = await Bun.file("docs/rules.md").text();
  const wiki = (await Bun.file("data/shows.json").json()).shows as Record<
    string,
    { min: number; max: number }
  >;
  const lookup = (name: string) =>
    Object.entries(wiki).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

  const order = parseShowOrder(rules);
  expect(order).toHaveLength(10);
  for (const show of order) {
    expect({ show: show.show, ...lookup(show.show) }).toEqual({
      show: show.show,
      min: show.min,
      max: show.max,
    });
  }
});
