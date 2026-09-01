import type { TournamentEvent } from "../src/types";
import { renderShows } from "./shows";

async function main(): Promise<void> {
  const target = document.querySelector<HTMLElement>("#shows");
  if (!target) return;

  try {
    const response = await fetch("./event.json");
    if (!response.ok) throw new Error(`event.json returned ${response.status}`);
    const event = (await response.json()) as TournamentEvent;
    document.querySelector<HTMLElement>("#results-subtitle")!.textContent =
      `${event.name} — ${event.shows.length} show${event.shows.length === 1 ? "" : "s"}`;
    target.innerHTML = renderShows(event.shows);
  } catch (error) {
    target.innerHTML = `<p class="empty">Could not load the results: ${error}</p>`;
  }
}

void main();
