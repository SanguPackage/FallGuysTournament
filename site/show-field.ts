import { fieldOf, type FieldPlayer } from "../src/field";
import type { Player, Show } from "../src/types";
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
