import type { LiveStatus } from "../src/live";
import type { LeaderboardRow } from "../src/types";
import { crownTitle } from "./crown";
import type { ShowInOrder } from "./rules";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ranks(rows: LeaderboardRow[]): number[] {
  const result: number[] = [];
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    result.push(previous && previous.points === row.points ? result[index - 1]! : index + 1);
  });
  return result;
}

/** The in-game name is what everyone is known by; a row still waiting for one falls back to FOM. */
function primary(row: LeaderboardRow): string {
  return escapeHtml(row.ingame || row.fom || "");
}

/** The FOM name under it, or the reason there is no in-game name above it. */
function secondary(row: LeaderboardRow): string {
  if (!row.ingame) return "no in-game name yet";
  return row.fom ? escapeHtml(row.fom) : "";
}

const EMPTY = `<p class="empty">No players registered yet.</p>`;

function crownRank(row: LeaderboardRow): string {
  if (row.crownRank === undefined) return "";
  const title = crownTitle(row.crownRank);
  return `<span class="crown-rank"${title ? ` title="${title}"` : ""}>👑${row.crownRank}</span>`;
}

/**
 * The mark that says a row opens. The row around it is the button, so it names nothing and takes
 * no clicks of its own.
 */
function look(row: LeaderboardRow): string {
  return row.ingame ? `<span class="look" aria-hidden="true">🔍</span>` : `<span class="look"></span>`;
}

/** Everything said under the name, dot-separated so an absent FOM name leaves no stray dot. */
function sub(row: LeaderboardRow): string {
  const parts = [secondary(row), crownRank(row)];
  if (row.penaltyPoints !== 0) parts.push(`<span class="pen">${row.penaltyPoints}</span>`);
  return parts.filter(Boolean).join(" · ");
}

/** Second, first and third, so the tallest card sits in the middle. */
const PODIUM_ORDER = [1, 0, 2];

export function renderPodium(rows: LeaderboardRow[]): string {
  if (rows.length === 0) return EMPTY;

  const rank = ranks(rows);
  const cards = PODIUM_ORDER.filter((index) => index < rows.length)
    .map((index) => {
      const row = rows[index]!;
      return `
      <div class="p p${index + 1}">
        <div class="rk">${rank[index]}</div>
        ${index === 0 ? `<div class="crown">👑</div>` : ""}
        <div class="bean"></div>
        <div class="nm">${primary(row)}</div>
        <div class="ig">${secondary(row)}</div>
        <div class="pts">${row.points}</div>
        <div class="sub">${row.raceWins} races · ${row.finalsReached} finals · ${row.finalsWon} wins</div>
      </div>`;
    })
    .join("");

  return `<div class="podium">${cards}</div>`;
}

export function renderField(rows: LeaderboardRow[], movers: Set<string> = new Set()): string {
  const field = rows.slice(3);
  if (field.length === 0) return "";

  const rank = ranks(rows);
  const cards = field
    .map(
      (row, index) => `
      <div class="${movers.has(row.ingame) ? "card up" : "card"}">
        <span class="n">${rank[index + 3]}</span>
        <span class="who"><b>${primary(row)}</b><small>${secondary(row)}</small></span>
        <span class="v">${row.points}</span>
      </div>`,
    )
    .join("");

  return `<h2>The rest of the field</h2><div class="grid">${cards}</div>`;
}

export function renderStandings(rows: LeaderboardRow[], movers: Set<string> = new Set()): string {
  if (rows.length === 0) return EMPTY;

  const rank = ranks(rows);
  const list = rows
    .map((row, index) => {
      const classes = ["row"];
      if (rank[index]! <= 3) classes.push(`r${rank[index]}`);
      if (!row.ingame) classes.push("pending");
      if (movers.has(row.ingame)) classes.push("up");

      if (row.ingame) classes.push("open-player");
      const cells = `
        <span class="rk">${rank[index]}</span>
        <span class="who"><b>${primary(row)}</b><small>${sub(row)}</small></span>
        <span class="stats">
          <span class="stat"><b>${row.raceWins}</b><span>Races</span></span>
          <span class="stat"><b>${row.finalsReached}</b><span>Finals</span></span>
          <span class="stat"><b>${row.finalsWon}</b><span>Wins</span></span>
        </span>
        <span class="pts">${row.points}</span>
        ${look(row)}`;

      // A row is read out by name rather than by its every cell, which would be the whole line.
      return row.ingame
        ? `
      <button type="button" class="${classes.join(" ")}" data-player="${escapeHtml(row.ingame)}"
        aria-label="Details for ${primary(row)}">${cells}
      </button>`
        : `
      <div class="${classes.join(" ")}">${cells}
      </div>`;
    })
    .join("");

  return `<div class="rows">${list}</div>`;
}

function pips(order: ShowInOrder[], orderIndex: number): string {
  const marks = order
    .map((_, index) => {
      const state = index < orderIndex ? " done" : index === orderIndex ? " now" : "";
      return `<span class="pip${state}"></span>`;
    })
    .join("");
  return `<div class="pips">${marks}</div>`;
}

function lastRoundCell(status: LiveStatus): string {
  const round = status.lastRound;
  if (!round) return `<div class="val">—</div>`;

  const winner = round.first ? ` <span class="by">${escapeHtml(round.first)}</span>` : "";
  return `<div class="val">${escapeHtml(round.map)} <span class="tag ${round.type}">${round.type}</span>${winner}</div>`;
}

export function renderStatus(status: LiveStatus, order: ShowInOrder[]): string {
  const round = status.round ? ` · Round ${status.round}` : "";
  const playing =
    status.state === "not-started"
      ? `<div class="val">Not started yet</div>`
      : `<div class="val">${escapeHtml(status.showName!)}</div>
         <div class="lbl spaced">Show ${status.showNumber}${round}</div>`;

  return `
    <div class="panel status">
      <div>
        <div class="lbl">Now playing</div>
        ${playing}
      </div>
      <div class="mid">
        <div class="lbl">${status.roundLive ? "On screen now" : "Last round"}</div>
        ${lastRoundCell(status)}
        ${pips(order, status.orderIndex)}
      </div>
      <div class="right">
        <div class="lbl">Up next</div>
        <div class="val">${status.nextShow ? escapeHtml(status.nextShow) : "That was the last one"}</div>
      </div>
    </div>`;
}
