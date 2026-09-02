import type { Penalty, Player, Players, Round, Show, TournamentEvent } from "./types";

export class ValidationError extends Error {}

export function resolvePlayer(players: Players, name: string): string {
  const target = name.trim().toLowerCase();
  const registered = players.players.filter((p): p is Player & { ingame: string } => !!p.ingame);
  const exact = registered.find((p) => p.ingame.toLowerCase() === target);
  if (exact) return exact.ingame;

  const known = registered.map((p) => p.ingame);
  const near = known.filter(
    (n) => n.toLowerCase().includes(target) || target.includes(n.toLowerCase()),
  );
  const suggestions = near.length > 0 ? near : known;
  throw new ValidationError(
    `Unknown in-game name "${name}". Registered: ${suggestions.join(", ")}`,
  );
}

export function currentShow(event: TournamentEvent): Show {
  const show = event.shows.at(-1);
  if (!show) throw new ValidationError("No show started yet. Run `bun run cli show` first.");
  return show;
}

function isClosed(show: Show): boolean {
  return show.rounds.some((round) => round.type === "final");
}

export function addShow(event: TournamentEvent, name: string): Show {
  const show: Show = { name, rounds: [] };
  event.shows.push(show);
  return show;
}

export function addRound(event: TournamentEvent, round: Round): void {
  const show = currentShow(event);
  if (isClosed(show)) {
    throw new ValidationError(
      `Show "${show.name}" is already closed. Start a new show first.`,
    );
  }
  show.rounds.push(round);
}

export function closeShow(
  event: TournamentEvent,
  final: { map: string; finalists: string[]; winners: string[] },
): void {
  const show = currentShow(event);
  if (isClosed(show)) {
    throw new ValidationError(`Show "${show.name}" is already closed.`);
  }
  const semi = show.rounds.at(-1);
  if (!semi) {
    throw new ValidationError(
      `Show "${show.name}" has no round before its final, so its finalists have nowhere to go.`,
    );
  }
  const notFinalists = final.winners.filter((w) => !final.finalists.includes(w));
  if (notFinalists.length > 0) {
    throw new ValidationError(
      `Winners must have reached the final: ${notFinalists.join(", ")} did not.`,
    );
  }
  semi.qualified = final.finalists;
  show.winners = final.winners;
  show.rounds.push({ map: final.map, type: "final" });
}

export function addPenalty(event: TournamentEvent, penalty: Penalty): void {
  event.penalties.push(penalty);
}
