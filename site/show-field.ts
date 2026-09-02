import { fieldOf, type FieldPlayer } from "../src/field";
import type { LiveStatus } from "../src/live";
import type { Player, Show, TournamentEvent } from "../src/types";
import { escapeHtml } from "./render";

function note(player: FieldPlayer): string {
  if (player.outAt !== undefined) return `out R${player.outAt}`;
  return player.firsts.length > 0 ? `⚡${player.firsts.join(" ⚡")}` : "";
}

function chip(player: FieldPlayer): string {
  const crown = player.state === "won" ? "👑 " : "";
  const detail = note(player);
  return `<span class="bn ${player.state}">${crown}<b>${escapeHtml(player.ingame)}</b>${
    detail ? `<small>${detail}</small>` : ""
  }</span>`;
}

export function renderShowField(show: Show, players: Player[]): string {
  const field = fieldOf(show, players);
  if (field.length === 0) return "";
  return `<div class="beans">${field.map(chip).join("")}</div>`;
}

function tally(show: Show, field: FieldPlayer[]): string {
  if (show.winners?.length) {
    return `<span class="champ">👑 ${show.winners.map(escapeHtml).join(" &amp; ")}</span>`;
  }
  const out = field.filter((player) => player.state === "out").length;
  return `<span class="count">${field.length - out} of ${field.length} still in</span>`;
}

function roundLine(status: LiveStatus): string {
  const round = status.round === undefined ? "" : `Round ${status.round}`;
  const last = status.lastRound;
  if (!last) return round ? `<span class="lbl">${round}</span>` : "";
  return `<span class="lbl">${round}${round ? " · " : ""}${escapeHtml(last.map)}</span>
      <span class="tag ${last.type}">${last.type}</span>`;
}

/**
 * The show on the wall, or the last one recorded once it is over, so the panel never disappears
 * out from under the podium between shows.
 */
export function renderShowNow(
  event: TournamentEvent,
  players: Player[],
  status: LiveStatus,
): string {
  const show = event.shows[(status.showNumber ?? 0) - 1] ?? event.shows.at(-1);
  if (!show) return "";
  const number = event.shows.indexOf(show) + 1;

  const field = fieldOf(show, players);
  const grid = field.length === 0 ? "" : `<div class="beans">${field.map(chip).join("")}</div>`;

  return `
    <div class="panel shownow">
      <header>
        <span class="num">${number}</span>
        <h3>${escapeHtml(show.name)}</h3>
        ${roundLine(status)}
        ${tally(show, field)}
      </header>
      ${grid}
    </div>`;
}
