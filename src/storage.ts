import type { Players, TournamentEvent } from "./types";

export const EVENT_PATH = "data/event.json";
export const PLAYERS_PATH = "data/players.json";

export async function loadEvent(path: string = EVENT_PATH): Promise<TournamentEvent> {
  return (await Bun.file(path).json()) as TournamentEvent;
}

export async function saveEvent(
  event: TournamentEvent,
  path: string = EVENT_PATH,
): Promise<void> {
  await Bun.write(path, `${JSON.stringify(event, null, 2)}\n`);
}

export async function loadPlayers(path: string = PLAYERS_PATH): Promise<Players> {
  return (await Bun.file(path).json()) as Players;
}
