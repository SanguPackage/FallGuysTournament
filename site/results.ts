import { roundFieldsOf } from "../src/field";
import { mergeLive, type LiveNow } from "../src/live";
import type { Player, Round, Show } from "../src/types";
import { escapeHtml } from "./render";
import { renderRoundBeans } from "./show-field";

function winnerCell(round: Round, show: Show, onScreen: boolean): string {
  if (round.type === "final") {
    if (show.winners?.length) {
      return `<span class="winner">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`;
    }
    return onScreen
      ? `<span class="winner none">on screen</span>`
      : `<span class="winner none">—</span>`;
  }
  if (round.first) return `<span class="winner">${escapeHtml(round.first)}</span>`;
  if (onScreen) return `<span class="winner none">on screen</span>`;
  return round.type === "race"
    ? `<span class="winner missing">first not recorded</span>`
    : `<span class="winner none">no points</span>`;
}

/**
 * `onScreen` is the 1-based round the log says is being played, which only the machine running
 * Fall Guys knows; `null` means nothing is loaded, or nothing is speaking for this show.
 */
function renderShow(
  show: Show,
  number: number,
  live: boolean,
  onScreen: number | null,
  players: Player[],
): string {
  const beans = roundFieldsOf(show, players);
  const rounds = show.rounds
    .map(
      (round, index) => `
      <div class="rnd ${round.type === "final" ? "final" : ""}">
        <span class="i">${index + 1}</span>
        <span class="map">${escapeHtml(round.map)}</span>
        <span class="type"><span class="tag ${round.type}">${round.type}</span></span>
        ${winnerCell(round, show, index + 1 === onScreen)}
        ${round.survivors === undefined ? "" : `<span class="through">${round.survivors} through</span>`}
        ${renderRoundBeans(beans[index] ?? [])}
      </div>`,
    )
    .join("");

  const badge = show.winners?.length
    ? `<span class="champ">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`
    : live
      ? `<span class="champ playing">● Playing now</span>`
      : "";

  const body =
    show.rounds.length > 0
      ? `<div class="rounds">${rounds}</div>`
      : live
        ? `<p class="empty">Loading the next round…</p>`
        : `<div class="rounds"></div>`;

  return `
    <div class="${live ? "show live" : "show"}">
      <div class="panel">
        <header>
          <span class="num">${number}</span>
          <h3>${escapeHtml(show.name)}</h3>
          ${badge}
        </header>
        ${body}
      </div>
    </div>`;
}

export function renderResults(
  shows: Show[],
  players: Player[],
  now: LiveNow | null = null,
): string {
  // The log runs ahead of what has been typed in, so the show on screen may have no entry yet.
  // Clamping keeps it on the end of the list rather than dropping it when a show went unrecorded.
  const liveIndex = now === null ? -1 : Math.max(0, Math.min(now.showNumber - 1, shows.length));
  const panels = [...shows];
  if (now !== null) panels[liveIndex] = mergeLive(shows[liveIndex], now);

  if (panels.length === 0) return `<p class="empty">No shows played yet.</p>`;

  const onScreen = now !== null && now.map !== null ? now.rounds.length : null;
  const current = liveIndex >= 0 ? liveIndex : panels.length - 1;

  return panels
    .map((show, index) => {
      const live = index === current && !show.winners?.length;
      return renderShow(show, index + 1, live, live ? onScreen : null, players);
    })
    .reverse()
    .join("");
}
