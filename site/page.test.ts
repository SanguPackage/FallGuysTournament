import { expect, test } from "bun:test";
import { page } from "./page";

test("the body is placed inside the document", () => {
  expect(page({ title: "Rules", current: "rules.html", body: "<p>Hi</p>" })).toContain("<p>Hi</p>");
});

test("every page links to the others", () => {
  const html = page({ title: "Rules", current: "rules.html", body: "" });
  expect(html).toContain(`href="./index.html"`);
  expect(html).toContain(`href="./shows.html"`);
});

test("the current page is marked rather than linked", () => {
  const html = page({ title: "Rules", current: "rules.html", body: "" });
  expect(html).not.toContain(`href="./rules.html"`);
  expect(html).toContain(`aria-current="page"`);
});
