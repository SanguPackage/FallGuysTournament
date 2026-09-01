import type { Round, Show } from "../src/types";
import { escapeHtml } from "./render";

function winnerCell(round: Round, show: Show): string {
  if (round.type === "final") {
    return show.winners?.length
      ? `<span class="winner">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`
      : `<span class="winner none">—</span>`;
  }
  if (round.first) return `<span class="winner">${escapeHtml(round.first)}</span>`;
  return round.type === "race"
    ? `<span class="winner missing">first not recorded</span>`
    : `<span class="winner none">no points</span>`;
}

function renderShow(show: Show, number: number, live: boolean): string {
  const rounds = show.rounds
    .map(
      (round, index) => `
      <div class="rnd ${round.type === "final" ? "final" : ""}">
        <span class="i">${index + 1}</span>
        <span class="map">${escapeHtml(round.map)}</span>
        <span class="type"><span class="tag ${round.type}">${round.type}</span></span>
        ${winnerCell(round, show)}
      </div>`,
    )
    .join("");

  const badge = show.winners?.length
    ? `<span class="champ">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`
    : live
      ? `<span class="champ playing">● Playing now</span>`
      : "";

  const finalists = show.finalists?.length
    ? `<p class="finalists">Finalists: <b>${show.finalists.map(escapeHtml).join(", ")}</b></p>`
    : "";

  return `
    <div class="${live ? "show live" : "show"}">
      <div class="panel">
        <header>
          <span class="num">${number}</span>
          <h3>${escapeHtml(show.name)}</h3>
          ${badge}
        </header>
        <div class="rounds">${rounds}</div>
        ${finalists}
      </div>
    </div>`;
}

export function renderResults(shows: Show[]): string {
  if (shows.length === 0) return `<p class="empty">No shows played yet.</p>`;

  const last = shows.length - 1;
  return shows
    .map((show, index) => renderShow(show, index + 1, index === last && !show.winners?.length))
    .reverse()
    .join("");
}
