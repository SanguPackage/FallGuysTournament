import type { LiveNow } from "../src/live";
import type { Player, Round, Show } from "../src/types";
import { escapeHtml } from "./render";
import { renderShowField } from "./show-field";

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

function renderShow(show: Show, number: number, live: boolean, players: Player[]): string {
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

  const field = renderShowField(show, players);

  return `
    <div class="${live ? "show live" : "show"}">
      <div class="panel">
        <header>
          <span class="num">${number}</span>
          <h3>${escapeHtml(show.name)}</h3>
          ${badge}
        </header>
        <div class="rounds">${rounds}</div>
        ${field}
      </div>
    </div>`;
}

/**
 * The show on screen is not in event.json until it is typed in, so the log speaks for it and the
 * round being played shows up here rather than only once the show is saved.
 */
function renderPlaying(now: LiveNow, players: Player[]): string {
  const last = now.rounds.length - 1;
  const rounds = now.rounds
    .map((entry, index) => {
      // Only the log speaks for this show, and it counts survivors without ever naming them.
      const through =
        entry.qualified === undefined
          ? `<span class="winner none">${index === last ? "on screen" : "—"}</span>`
          : `<span class="winner none">${entry.qualified} through</span>`;

      return `
      <div class="rnd ${entry.type === "final" ? "final" : ""}">
        <span class="i">${index + 1}</span>
        <span class="map">${escapeHtml(entry.map)}</span>
        <span class="type"><span class="tag ${entry.type}">${entry.type}</span></span>
        ${through}
      </div>`;
    })
    .join("");

  const round = now.map === null ? `<p class="empty">Loading the next round…</p>` : rounds;

  return `
    <div class="show live">
      <div class="panel">
        <header>
          <span class="num">${now.showNumber}</span>
          <h3>${escapeHtml(now.show)}</h3>
          <span class="champ playing">● Playing now</span>
        </header>
        <div class="rounds">${round}</div>
        ${renderShowField({ name: now.show, rounds: [] }, players)}
      </div>
    </div>`;
}

export function renderResults(
  shows: Show[],
  players: Player[],
  now: LiveNow | null = null,
): string {
  const unrecorded = now !== null && now.showNumber > shows.length;
  const playing = unrecorded ? renderPlaying(now, players) : "";

  if (shows.length === 0) {
    return playing || `<p class="empty">No shows played yet.</p>`;
  }

  const last = shows.length - 1;
  const recorded = shows
    .map((show, index) =>
      renderShow(show, index + 1, !unrecorded && index === last && !show.winners?.length, players),
    )
    .reverse()
    .join("");

  return playing + recorded;
}
