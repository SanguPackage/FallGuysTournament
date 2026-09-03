import { roundFieldsOf } from "../src/field";
import { mergeLive, type LiveNow } from "../src/live";
import type { Player, Round, Show } from "../src/types";
import { escapeHtml } from "./render";
import { levelIcon, levelLink } from "./sangu";
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
  // Whoever crossed first wears it on their badge, so the line does not say it twice.
  if (round.first) return `<span class="winner none"></span>`;
  if (onScreen) return `<span class="winner none">on screen</span>`;
  // A round nobody wins still holds its column, so the tally stays under the tally heading.
  return round.type === "race"
    ? `<span class="winner missing">first not recorded</span>`
    : `<span class="winner none"></span>`;
}

/** A decided final counts crowns, not survivors: one name through a final is the show's winner. */
function tallyCell(round: Round, show: Show): string {
  const winners = round.type === "final" ? (show.winners?.length ?? 0) : 0;
  if (winners > 0) {
    return `<span class="through">${winners} winner${winners === 1 ? "" : "s"}</span>`;
  }
  if (round.survivors === undefined) return "";
  return `<span class="through">${round.survivors} through</span>`;
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
        <span class="map">${levelIcon(round.map)}${escapeHtml(round.map)}${levelLink(round.map)}</span>
        <span class="type"><span class="tag ${round.type}">${round.type}</span></span>
        ${winnerCell(round, show, index + 1 === onScreen)}
        ${tallyCell(round, show)}
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

/**
 * Which panel the log is speaking for. It counts shows nobody typed in, so its number can run past
 * the end of the list; a run whose maps repeat the last show recorded is that show counted again,
 * not a new one, and folding it back keeps a finished show from standing twice.
 */
function liveIndexOf(shows: Show[], now: LiveNow): number {
  const index = Math.max(0, Math.min(now.showNumber - 1, shows.length));
  if (index < shows.length) return index;

  const last = shows[shows.length - 1];
  const repeats =
    last !== undefined &&
    now.rounds.length > 0 &&
    now.rounds.every((round, at) => last.rounds[at]?.map === round.map);
  return repeats ? shows.length - 1 : index;
}

export function renderResults(
  shows: Show[],
  players: Player[],
  now: LiveNow | null = null,
): string {
  const liveIndex = now === null ? -1 : liveIndexOf(shows, now);
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
