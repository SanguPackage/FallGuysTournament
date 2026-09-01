import type { Round, Show } from "../src/types";
import { escapeHtml } from "./render";

const TYPE_LABEL: Record<Round["type"], string> = {
  race: "Race",
  survival: "Survival",
  final: "Final",
};

function names(list: string[]): string {
  return list.map((name) => `<span class="name">${escapeHtml(name)}</span>`).join(" ");
}

function renderRound(round: Round, index: number): string {
  const first =
    round.type !== "race"
      ? ""
      : round.first
        ? `<span class="first">first: ${escapeHtml(round.first)}</span>`
        : `<span class="first missing">first not recorded</span>`;

  return `
    <li>
      <span class="round-number">${index + 1}</span>
      <span class="map">${escapeHtml(round.map)}</span>
      <span class="type type-${round.type}">${TYPE_LABEL[round.type]}</span>
      ${first}
    </li>`;
}

function renderShow(show: Show, index: number): string {
  const finalists = show.finalists ?? [];
  const winners = show.winners ?? [];

  const outcome =
    finalists.length === 0 && winners.length === 0
      ? ""
      : `
      <dl class="outcome">
        <dt>Finalists</dt>
        <dd>${finalists.length > 0 ? names(finalists) : "—"}</dd>
        <dt>${winners.length > 1 ? "Winners" : "Winner"}</dt>
        <dd class="winners">${winners.length > 0 ? names(winners) : "—"}</dd>
      </dl>`;

  return `
    <section class="show">
      <h2><span class="show-number">Show ${index + 1}</span> ${escapeHtml(show.name)}</h2>
      <ol class="rounds">${show.rounds.map(renderRound).join("")}</ol>
      ${outcome}
    </section>`;
}

export function renderShows(shows: Show[]): string {
  if (shows.length === 0) {
    return `<p class="empty">No shows played yet.</p>`;
  }
  return shows.map(renderShow).join("");
}
