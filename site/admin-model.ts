import type { ParsedShow } from "../src/log";
import type { Round, RoundType, Show } from "../src/types";

export interface RoundDraft {
  map: string;
  type: RoundType;
  first: string;
}

export interface ShowDraft {
  name: string;
  rounds: RoundDraft[];
  finalists: string[];
  winners: string[];
}

export function draftFor(parsed: ParsedShow): ShowDraft {
  const final = parsed.rounds.at(-1);
  return {
    name: "",
    rounds: parsed.rounds.map((round) => ({
      map: round.id,
      type: round.isFinal ? "final" : "race",
      first: "",
    })),
    finalists: Array(final?.present.length ?? 0).fill(""),
    winners: parsed.winnerId === undefined ? [] : [""],
  };
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

export function validate(draft: ShowDraft, registered: string[]): string[] {
  const problems: string[] = [];

  if (!draft.name.trim()) problems.push("Give the show a name.");

  draft.rounds.forEach((round, index) => {
    if (round.type === "race" && !round.first.trim()) {
      problems.push(`Round ${index + 1} is a race and needs a first place.`);
    }
  });

  const finalists = filled(draft.finalists);
  const winners = filled(draft.winners);
  const named = [...draft.rounds.map((round) => round.first), ...finalists, ...winners];
  for (const name of filled(named)) {
    if (!registered.includes(name)) problems.push(`"${name}" is not a registered player.`);
  }

  const twice = finalists.filter((name, index) => finalists.indexOf(name) !== index);
  for (const name of new Set(twice)) problems.push(`${name} is listed twice as a finalist.`);

  const notFinalists = winners.filter((name) => !finalists.includes(name));
  if (notFinalists.length > 0) {
    problems.push(`Winners must be finalists: ${notFinalists.join(", ")}.`);
  }

  return [...new Set(problems)];
}
