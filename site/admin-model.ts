import type { ParsedShow } from "../src/log";
import { score } from "../src/scoring";
import type { Players, Round, RoundType, Show, TournamentEvent } from "../src/types";
import type { ShowInOrder } from "./rules";

export interface RoundDraft {
  map: string;
  type: RoundType;
  first: string;
  /** Set once the admin picks a type, so the log never overrides their judgement. */
  typeEdited?: boolean;
}

export interface ShowDraft {
  name: string;
  rounds: RoundDraft[];
  finalists: string[];
  winners: string[];
}

export function draftFor(parsed: ParsedShow, name = ""): ShowDraft {
  const draft: ShowDraft = { name, rounds: [], finalists: [], winners: [] };
  syncDraft(draft, parsed);
  return draft;
}

/**
 * Folds rounds that appeared in the log since the last look into a draft being typed, without
 * touching anything already entered.
 */
export function syncDraft(draft: ShowDraft, parsed: ParsedShow): void {
  for (const round of parsed.rounds.slice(draft.rounds.length)) {
    draft.rounds.push({ map: round.id, type: round.isFinal ? "final" : "race", first: "" });
  }

  parsed.rounds.forEach((round, index) => {
    const entry = draft.rounds[index];
    if (entry && !entry.typeEdited) entry.type = round.isFinal ? "final" : "race";
  });

  const finalists = parsed.rounds.at(-1)?.present.length ?? 0;
  while (draft.finalists.length < finalists) draft.finalists.push("");

  if (parsed.winnerId !== undefined && draft.winners.length === 0) draft.winners.push("");
}

/** The next show in the planned order that has not been played, which is almost always the one on. */
export function suggestShowName(order: ShowInOrder[], recorded: string[]): string {
  return order.find((show) => !recorded.includes(show.show))?.show ?? "";
}

function filled(names: string[]): string[] {
  return names.map((name) => name.trim()).filter(Boolean);
}

export function toShow(draft: ShowDraft): Show {
  const rounds: Round[] = draft.rounds.map((round) => {
    const first = round.first.trim();
    return round.type === "race" && first
      ? { map: round.map, type: round.type, first }
      : { map: round.map, type: round.type };
  });

  return {
    name: draft.name.trim(),
    rounds,
    finalists: filled(draft.finalists),
    winners: filled(draft.winners),
  };
}

export function validate(draft: ShowDraft): string[] {
  const problems: string[] = [];

  if (!draft.name.trim()) problems.push("Give the show a name.");

  const finalists = filled(draft.finalists);
  const winners = filled(draft.winners);

  const twice = finalists.filter((name, index) => finalists.indexOf(name) !== index);
  for (const name of new Set(twice)) problems.push(`${name} is listed twice as a finalist.`);

  const notFinalists = winners.filter((name) => !finalists.includes(name));
  if (notFinalists.length > 0) {
    problems.push(`Winners must be finalists: ${notFinalists.join(", ")}.`);
  }

  return [...new Set(problems)];
}

/** What the publish box starts out saying, so the history reads consistently without typing. */
export function defaultMessage(event: TournamentEvent): string {
  const last = event.shows.at(-1);
  return last ? `data: record show ${event.shows.length} — ${last.name}` : "data: update players";
}

/** Every name the admin has already typed into a show, so it can be picked rather than retyped. */
export function namesInShows(event: TournamentEvent): string[] {
  const names = event.shows.flatMap((show) => [
    ...show.rounds.map((round) => round.first),
    ...(show.finalists ?? []),
    ...(show.winners ?? []),
  ]);
  return [...new Set(names.filter((name): name is string => !!name))].sort();
}

/**
 * Every known name, best scorer first. The people most likely to be typed next are the ones
 * already winning, so they sit at the top of the dropdown.
 */
export function namesByPoints(event: TournamentEvent, players: Players): string[] {
  const competing: string[] = [];
  const admins = new Set<string>();
  for (const player of players.players) {
    if (!player.ingame) continue;
    if (player.admin) admins.add(player.ingame);
    else competing.push(player.ingame);
  }

  const points = new Map(
    score(event, players)
      .filter((row) => row.ingame)
      .map((row) => [row.ingame!, row.points]),
  );

  return [...new Set([...competing, ...namesInShows(event)])]
    .filter((name) => !admins.has(name))
    .sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || a.localeCompare(b));
}
