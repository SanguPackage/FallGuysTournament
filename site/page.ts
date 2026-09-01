import { escapeHtml } from "./render";

const NAV = [
  { href: "./index.html", label: "Standings" },
  { href: "./results.html", label: "Results" },
  { href: "./rules.html", label: "Rules" },
  { href: "./shows.html", label: "Show order" },
] as const;

export interface PageOptions {
  title: string;
  current: string;
  body: string;
}

export function nav(current: string): string {
  const links = NAV.map(({ href, label }) =>
    href.endsWith(`/${current}`)
      ? `<span aria-current="page">${label}</span>`
      : `<a href="${href}">${label}</a>`,
  ).join("");
  return `<nav>${links}</nav>`;
}

export function page({ title, current, body }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='14' font-size='14'%3E%F0%9F%91%91%3C/text%3E%3C/svg%3E"
    />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      ${nav(current)}
${body}
    </main>
  </body>
</html>
`;
}
