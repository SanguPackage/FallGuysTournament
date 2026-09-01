import { expect, test } from "bun:test";
import { page } from "./page";

const RULES = { event: "FOM 2026", title: "Rules", heading: "Rules", current: "rules.html", body: "<p>Hi</p>" };

test("the body is placed inside the document", () => {
  expect(page(RULES)).toContain("<p>Hi</p>");
});

test("every page links to the others", () => {
  const html = page(RULES);
  expect(html).toContain(`href="./index.html"`);
  expect(html).toContain(`href="./standings.html"`);
  expect(html).toContain(`href="./results.html"`);
  expect(html).toContain(`href="./shows.html"`);
});

test("the current page is marked rather than linked", () => {
  const html = page(RULES);
  expect(html).not.toContain(`href="./rules.html"`);
  expect(html).toContain(`aria-current="page"`);
});

test("the heading is the page's own, not the site title", () => {
  expect(page({ ...RULES, heading: "Show order" })).toContain("<h1>Show order</h1>");
});

test("a page that reloads itself carries the live badge and says which data it wants", () => {
  const html = page({ ...RULES, current: "index.html", live: "dashboard" });
  expect(html).toContain(`class="live"`);
  expect(html).toContain(`data-page="dashboard"`);
  expect(html).toContain("main.js");
});

test("a static page has no badge and loads no script", () => {
  const html = page(RULES);
  expect(html).not.toContain(`class="live"`);
  expect(html).not.toContain("main.js");
});

test("every page credits the source and itenium", () => {
  const html = page(RULES);
  expect(html).toContain("github.com/SanguPackage/FallGuysTournament");
  expect(html).toContain("https://itenium.be");
});

test("the badge carries the event's own name", () => {
  expect(page({ ...RULES, event: "FOM 2027" })).toContain(">FOM 2027<");
});

test("the title is escaped", () => {
  expect(page({ ...RULES, title: "<script>" })).not.toContain("<title><script>");
});
