import type { Prize } from "../src/types";
import { CROWN, PODIUM_ORDER, escapeHtml } from "./render";

const PLACE = ["1st", "2nd", "3rd"];
const MEDAL = ["🥇", "🥈", "🥉"];

/** The same podium the dashboard builds, with the prize itself standing where the bean does. */
export function renderPrizes(prizes: Prize[]): string {
  const steps = PLACE.map((_, index) => prizes.find((prize) => prize.place === index + 1));
  const cards = PODIUM_ORDER.filter((index) => steps[index])
    .map((index) => {
      const prize = steps[index]!;
      return `
      <div class="p p${index + 1} prize">
        <div class="figure">
          ${index === 0 ? CROWN : ""}
          <img src="./img/prizes/${escapeHtml(prize.image)}" alt="${escapeHtml(prize.name)}" />
        </div>
        <div class="nm">${escapeHtml(prize.name)}</div>
        <div class="block">
          <span class="pts">${MEDAL[index]}</span>
          <span class="rk">${PLACE[index]}</span>
        </div>
      </div>`;
    })
    .join("");

  return cards === "" ? "" : `<div class="podium prizes">${cards}</div>`;
}
