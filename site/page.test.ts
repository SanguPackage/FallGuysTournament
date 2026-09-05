import { expect, test } from "bun:test";
import { nav, page, tabs } from "./page";

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

test("every page points at the Fall Guys clips on sangu.be", () => {
  expect(page(RULES)).toContain(`href="https://sangu.be/fallguys/"`);
});

test("the badge carries the event's own name", () => {
  expect(page({ ...RULES, event: "FOM 2027" })).toContain(">FOM 2027<");
});

test("the title is escaped", () => {
  expect(page({ ...RULES, title: "<script>" })).not.toContain("<title><script>");
});

test("a lobby code is shown as a badge beside the heading, upper case", () => {
  const html = page({ ...RULES, lobbyCode: "abc123" });
  expect(html).toContain("Lobby code");
  expect(html).toContain(">ABC123<");
  expect(html).not.toContain(`class="lobby" hidden`);
});

test("the badge sits in the masthead, after the nav and outside it", () => {
  const html = page({ ...RULES, lobbyCode: "abc123" });
  expect(html.indexOf("<nav>")).toBeLessThan(html.indexOf(`class="lobby"`));
  expect(html.indexOf(`class="lobby"`)).toBeLessThan(html.indexOf("</div>\n<p>Hi</p>"));
  expect(nav("rules.html")).not.toContain("lobby");
});

test("the badge is in the page but hidden when there is no lobby code", () => {
  expect(page(RULES)).toContain(`class="lobby" hidden`);
});

test("the badge carries a help button that opens the join steps", () => {
  const html = page({ ...RULES, lobbyCode: "abc123" });
  expect(html).toContain(`popovertarget="join"`);
  expect(html).toContain(`title="How to join"`);
  expect(html).toContain(`id="join"`);
  expect(html).toContain("Custom Games");
});

test("the join steps repeat the code, so it is on screen while reading them", () => {
  const html = page({ ...RULES, lobbyCode: "abc123" });
  expect(html.match(/>ABC123</g)).toHaveLength(2);
});

test("a lobby code is escaped", () => {
  expect(page({ ...RULES, lobbyCode: "<b>" })).not.toContain("<B>");
});

test("the first tab is the one open on arrival", () => {
  const html = tabs([
    { id: "rules", label: "Rules", body: "<p>A</p>" },
    { id: "prizes", label: "Prizes", body: "<p>B</p>" },
  ]);
  expect(html).toContain(`id="tab-rules" checked`);
  expect(html).not.toContain(`id="tab-prizes" checked`);
});

test("each tab's label switches to its own panel", () => {
  const html = tabs([
    { id: "rules", label: "Rules", body: "<p>A</p>" },
    { id: "prizes", label: "Prizes", body: "<p>B</p>" },
  ]);
  expect(html).toContain(`<label for="tab-prizes">Prizes</label>`);
  expect(html).toContain("<p>B</p>");
});

test("a panel follows its own radio, which is what opens it without script", () => {
  const html = tabs([{ id: "rules", label: "Rules", body: "<p>A</p>" }]);
  expect(html).toMatch(/id="tab-rules"[^>]*>\s*<section class="tabpanel">/);
});

test("an alert is shown as a banner on every page", () => {
  const html = page({ ...RULES, alert: "Doors close at 19:00" });
  expect(html).toContain("Doors close at 19:00");
  expect(html).not.toContain(`class="alert" hidden`);
});

test("the alert banner is in the page but hidden when there is no message", () => {
  expect(page(RULES)).toContain(`class="alert" hidden`);
});

test("the alert sits above the masthead, so it is read before the page", () => {
  const html = page({ ...RULES, alert: "Doors close at 19:00" });
  expect(html.indexOf(`id="alert"`)).toBeLessThan(html.indexOf(`class="masthead"`));
});

test("an alert is escaped", () => {
  expect(page({ ...RULES, alert: "<b>x</b>" })).not.toContain("<b>x</b>");
});
