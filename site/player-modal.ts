import type { CellState, DetailCell, PlayerDetail, Placing, ShowLine } from "../src/player-detail";
import type { LeaderboardRow } from "../src/types";
import { escapeHtml } from "./render";

const MARK: Record<CellState, string> = {
  first: "⚡",
  won: "👑",
  through: "✓",
  out: "✗",
  unknown: "?",
  none: "·",
};

const BADGE: Record<Placing, string> = {
  won: "👑 Winner",
  finalist: "Finalist",
  playing: "Still in",
  contestant: "Contestant",
};

function stat(value: number, label: string, kind = ""): string {
  return `<span class="s ${kind}"><b>${value}</b><span>${label}</span></span>`;
}

function header(row: LeaderboardRow): string {
  const rank =
    row.crownRank === undefined
      ? ""
      : ` <span class="crown-rank">👑${row.crownRank}</span>`;
  const ingame = row.ingame
    ? `${escapeHtml(row.ingame)}${rank}`
    : `<span class="pending">no in-game name yet</span>`;

  return `
    <header class="detail-head">
      <div class="who">
        <h2>${escapeHtml(row.fom)}</h2>
        <p>${ingame}</p>
      </div>
      <div class="stats">
        ${stat(row.points, "Points", "pts")}
        ${stat(row.raceWins, "Races")}
        ${stat(row.finalsReached, "Finals")}
        ${stat(row.finalsWon, "Wins")}
        ${row.penaltyPoints === 0 ? "" : stat(row.penaltyPoints, "Penalty", "pen")}
      </div>
    </header>`;
}

function cell(entry: DetailCell | undefined): string {
  if (!entry) return `<span class="c none">${MARK.none}</span>`;
  // Only `unknown` needs saying: every other mark reads off the legend.
  const why = entry.state === "unknown" ? " — no qualification board read" : "";
  const title = `${escapeHtml(entry.map)} — ${entry.type}${why}`;
  return `<span class="c ${entry.state}" title="${title}">${MARK[entry.state]}</span>`;
}

function showRow(show: ShowLine, columns: number): string {
  const cells = Array.from({ length: columns }, (_, index) => cell(show.cells[index])).join("");
  return `
      <div class="gr ${show.placing}">
        <span class="gname"><i>${show.number}</i>${escapeHtml(show.name)}</span>
        <span class="cells">${cells}</span>
        <span class="badge ${show.placing}">${BADGE[show.placing]}</span>
        <span class="pt">${show.points > 0 ? `+${show.points}` : "0"}</span>
      </div>`;
}

const LEGEND = [
  ["first", "crossed first"],
  ["through", "qualified"],
  ["out", "knocked out"],
  ["won", "won the show"],
  ["unknown", "no board read"],
] as const;

function legend(): string {
  const keys = LEGEND.map(
    ([state, label]) => `<span class="key"><i class="c ${state}">${MARK[state]}</i>${label}</span>`,
  ).join("");
  return `<p class="legend">${keys}<span class="key hint">hover a round for its map</span></p>`;
}

export function renderPlayerModal(detail: PlayerDetail): string {
  const { row, shows } = detail;
  if (shows.length === 0) {
    return `${header(row)}<p class="empty">No shows played yet.</p>`;
  }

  const columns = Math.max(...shows.map((show) => show.cells.length), 1);
  const heads = Array.from({ length: columns }, (_, at) => `<span class="rh">R${at + 1}</span>`);

  return `${header(row)}
    <div class="rgrid">
      <div class="gr head"><span class="gname"></span><span class="cells">${heads.join("")}</span></div>
      ${shows.map((show) => showRow(show, columns)).join("")}
    </div>
    ${legend()}`;
}
