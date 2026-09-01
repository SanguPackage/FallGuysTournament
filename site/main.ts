import { score } from "../src/scoring";
import type { Players, TournamentEvent } from "../src/types";
import { renderLeaderboard } from "./render";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const target = document.querySelector<HTMLElement>("#leaderboard");
  if (!target) return;

  try {
    const [event, players] = await Promise.all([
      fetchJson<TournamentEvent>("./event.json"),
      fetchJson<Players>("./players.json"),
    ]);
    document.querySelector<HTMLElement>("#event-name")!.textContent = event.name;
    document.querySelector<HTMLElement>("#show-count")!.textContent =
      `${event.shows.length} show${event.shows.length === 1 ? "" : "s"} played`;
    target.innerHTML = renderLeaderboard(score(event, players));
  } catch (error) {
    target.innerHTML = `<p class="empty">Could not load the standings: ${error}</p>`;
  }
}

void main();
