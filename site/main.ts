import { liveStatus } from "../src/live";
import { score } from "../src/scoring";
import type { LeaderboardRow, Players, TournamentEvent } from "../src/types";
import { renderField, renderPodium, renderStandings, renderStatus } from "./render";
import { renderResults } from "./results";
import type { ShowInOrder } from "./rules";
import { renderShowOrder } from "./rules";

const POLL_MS = 15_000;
/** Long enough to catch the eye of someone across the room, short enough to be gone next poll. */
const MOVER_MS = 6_000;

interface Data {
  event: TournamentEvent;
  players: Players;
  order: ShowInOrder[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function load(): Promise<{ data: Data; signature: string }> {
  const [event, players, order] = await Promise.all([
    fetchJson<TournamentEvent>("./event.json"),
    fetchJson<Players>("./players.json"),
    fetchJson<ShowInOrder[]>("./order.json"),
  ]);
  return { data: { event, players, order }, signature: JSON.stringify([event, players]) };
}

function render(page: string, data: Data, rows: LeaderboardRow[], movers: Set<string>): string {
  const status = liveStatus(data.event, data.order);
  switch (page) {
    case "dashboard":
      return renderStatus(status, data.order) + renderPodium(rows) + renderField(rows, movers);
    case "standings":
      return renderStandings(rows, movers);
    case "results":
      return renderResults(data.event.shows);
    case "shows":
      return renderShowOrder(data.order, status.orderIndex);
    default:
      return "";
  }
}

function moversSince(previous: Map<string, number>, rows: LeaderboardRow[]): Set<string> {
  const movers = new Set<string>();
  for (const row of rows) {
    const before = previous.get(row.fom);
    if (before !== undefined && row.points > before) movers.add(row.fom);
  }
  return movers;
}

function main(): void {
  const page = document.body.dataset.page;
  const target = document.querySelector<HTMLElement>("#data");
  const badge = document.querySelector<HTMLElement>("#live");
  if (!page || !target) return;

  let signature = "";
  let points = new Map<string, number>();
  let moverTimer: ReturnType<typeof setTimeout> | undefined;

  const paint = (data: Data, rows: LeaderboardRow[], movers: Set<string>): void => {
    target.innerHTML = render(page, data, rows, movers);
  };

  const poll = async (): Promise<void> => {
    let loaded: Awaited<ReturnType<typeof load>>;
    try {
      loaded = await load();
    } catch {
      badge?.classList.add("stale");
      return;
    }
    badge?.classList.remove("stale");

    const { data, signature: next } = loaded;
    if (next === signature) return;

    const rows = score(data.event, data.players);
    const movers = signature === "" ? new Set<string>() : moversSince(points, rows);
    signature = next;
    points = new Map(rows.map((row) => [row.fom, row.points]));

    paint(data, rows, movers);
    clearTimeout(moverTimer);
    if (movers.size > 0) {
      moverTimer = setTimeout(() => paint(data, rows, new Set()), MOVER_MS);
    }
  };

  void poll();
  setInterval(() => void poll(), POLL_MS);
}

main();
