import type { LiveStatus } from "../src/live";
import type { LeaderboardRow } from "../src/types";
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

function ingame(row: LeaderboardRow): string {
  return row.ingame ? escapeHtml(row.ingame) : "no in-game name yet";
}

const EMPTY = `<p class="empty">No players registered yet.</p>`;

function crownRank(row: LeaderboardRow): string {
  if (row.crownRank === undefined) return "";
  return ` · <span class="crown-rank">👑${row.crownRank}</span>`;
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
        <div class="nm">${escapeHtml(row.fom)}</div>
        <div class="ig">${ingame(row)}</div>
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
      <div class="${movers.has(row.fom) ? "card up" : "card"}">
        <span class="n">${rank[index + 3]}</span>
        <span class="who"><b>${escapeHtml(row.fom)}</b><small>${ingame(row)}</small></span>
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
      if (movers.has(row.fom)) classes.push("up");
      const penalty = row.penaltyPoints !== 0 ? ` · <span class="pen">${row.penaltyPoints}</span>` : "";

      return `
      <div class="${classes.join(" ")}">
        <span class="rk">${rank[index]}</span>
        <span class="who"><b>${escapeHtml(row.fom)}</b><small>${ingame(row)}${crownRank(row)}${penalty}</small></span>
        <span class="stats">
          <span class="stat"><b>${row.raceWins}</b><span>Races</span></span>
          <span class="stat"><b>${row.finalsReached}</b><span>Finals</span></span>
          <span class="stat"><b>${row.finalsWon}</b><span>Wins</span></span>
        </span>
        <span class="pts">${row.points}</span>
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
