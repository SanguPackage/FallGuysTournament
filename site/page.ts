import { escapeHtml } from "./render";
import { SANGU, sanguMark } from "./sangu";

const NAV = [
  { href: "./index.html", label: "Dashboard" },
  { href: "./standings.html", label: "Standings" },
  { href: "./results.html", label: "Results" },
  { href: "./rules.html", label: "Rules" },
  { href: "./shows.html", label: "Show order" },
] as const;

const REPO = "https://github.com/SanguPackage/FallGuysTournament";

/** Which data region `site/main.ts` should keep refreshed. Absent on the pages that never change. */
export type LivePage = "dashboard" | "standings" | "results" | "shows";

export interface PageOptions {
  event: string;
  title: string;
  heading: string;
  current: string;
  body: string;
  live?: LivePage;
  /** The custom lobby's join code. Absent whenever the lobby is not a custom one. */
  lobbyCode?: string;
}

/** Read off a phone across the room, so it is set in the largest thing on the bar. */
function lobbyBadge(code: string): string {
  return `<span class="lobby"><small>Lobby code</small><b>${escapeHtml(code.toUpperCase())}</b></span>`;
}

export function nav(current: string, lobbyCode?: string): string {
  const links = NAV.map(({ href, label }) =>
    href.endsWith(`/${current}`)
      ? `<span aria-current="page">${label}</span>`
      : `<a href="${href}">${label}</a>`,
  ).join("");
  return `<nav>${links}${lobbyCode ? lobbyBadge(lobbyCode) : ""}</nav>`;
}

function footer(): string {
  return `<footer>
      <a href="${REPO}" target="_blank" rel="noopener">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
        <span>Source on GitHub</span>
      </a>
      <a class="sangu" href="${SANGU}" target="_blank" rel="noopener">
        ${sanguMark(20)}
        <span>Fall Guys @ Sangu</span>
      </a>
      <a class="it" href="https://itenium.be" target="_blank" rel="noopener">
        <svg class="mark" width="20" height="20" viewBox="0 0 500 500" aria-hidden="true"><path d="M240.966 28.8038L212.041 8.12531C106.866 131.104 77.6294 281.627 142.886 365.2L182.882 328.681C128.229 258.296 152.632 132.118 240.966 28.8038Z"/><path d="M258.349 473.196L287.274 493.875C392.449 370.896 421.608 220.373 356.429 136.8L316.433 173.319C371.087 243.704 346.684 369.96 258.349 473.274V473.196Z"/></svg>
        <span class="name">itenium</span>
      </a>
    </footer>`;
}

/**
 * Outside `.wrap`, and so outside `#data`, which every poll overwrites wholesale. `showModal()`
 * lifts it into the top layer, so where it sits in the document does not decide where it draws.
 */
function playerDialog(): string {
  return `    <dialog id="player" class="detail">
      <button type="button" class="x" data-close-player aria-label="Close">✕</button>
      <div id="player-body"></div>
    </dialog>`;
}

export function page({ event, title, heading, current, body, live, lobbyCode }: PageOptions): string {
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
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Titan+One&family=Baloo+2:wght@500;700;800&family=Barlow+Condensed:wght@500;600;700&display=swap"
    />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body${live ? ` data-page="${live}"` : ""}>
    <div class="wrap">
      <div class="topbar">
        <span class="fom">${escapeHtml(event)}</span>
        ${live ? `<span class="live" id="live"><i class="dot"></i> Live</span>` : ""}
      </div>
      <h1>${escapeHtml(heading)}</h1>
      ${nav(current, lobbyCode)}
${body}
      ${footer()}
    </div>
${live ? `${playerDialog()}\n    <script type="module" src="./main.js"></script>\n` : ""}  </body>
</html>
`;
}
