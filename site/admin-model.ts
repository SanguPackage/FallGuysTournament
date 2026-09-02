import type { ParsedShow } from "../src/log";
import { score } from "../src/scoring";
import { SCORES_FIRST } from "../src/rounds";

export { ROUND_TYPES, SCORES_FIRST } from "../src/rounds";
import type { Players, Round, RoundType, Show, TournamentEvent } from "../src/types";
import type { SlotFill } from "../src/ocr/autofill";

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
  checked?: boolean;
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
    draft.rounds.push({ map: round.name, type: round.type, first: "" });
  }

  parsed.rounds.forEach((round, index) => {
    const entry = draft.rounds[index];
    if (entry && !entry.typeEdited) entry.type = round.type;
  });

  // parseLog calls the last round a final, but mid-show that is only the round being played.
  const last = parsed.rounds.at(-1);
  const final = last?.type === "final" || parsed.winnerId !== undefined ? last : undefined;

  fit(draft.finalists, final?.present.length ?? 0);
  // Whoever succeeded in the final won it, however many that turns out to be.
  fit(draft.winners, Math.max(final?.qualified.length ?? 0, parsed.winnerId === undefined ? 0 : 1));
}

/** Grows to what the log now says, and gives back only slots nobody has typed into. */
function fit(names: string[], wanted: number): void {
  while (names.length > wanted && names.at(-1) === "") names.pop();
  while (names.length < wanted) names.push("");
}

/** Reopens a show already in event.json, so blanks left at save time can still be filled in. */
export function draftFromShow(show: Show, parsed: ParsedShow): ShowDraft {
  const draft: ShowDraft = {
    name: show.name,
    rounds: show.rounds.map((round) => ({
      map: round.map,
      type: round.type,
      first: round.first ?? "",
      typeEdited: true,
    })),
    finalists: [...(show.finalists ?? [])],
    winners: [...(show.winners ?? [])],
    ...(show.checked ? { checked: true } : {}),
  };
  syncDraft(draft, parsed);
  return draft;
}

/** The playlists the log cannot tell apart, since every solo show carries the same id. */
const SHOW_NAMES: Record<string, string> = {
  classic_solo_main_show: "Solos",
  pl_solo_main_show: "Solos",
};

/** A show is named for its id and how many of that id came before it, e.g. the third is Solos 3. */
export function suggestShowName(shows: ParsedShow[], index: number): string {
  const parsed = shows[index];
  if (!parsed) return "";
  const before = shows.slice(0, index).filter((show) => show.showId === parsed.showId).length;
  return `${SHOW_NAMES[parsed.showId] ?? parsed.showId} ${before + 1}`;
}

function filled(names: string[]): string[] {
  return names.map((name) => name.trim()).filter(Boolean);
}

export function toShow(draft: ShowDraft): Show {
  const rounds: Round[] = draft.rounds.map((round) => {
    const first = round.first.trim();
    return SCORES_FIRST.has(round.type) && first
      ? { map: round.map, type: round.type, first }
      : { map: round.map, type: round.type };
  });

  return {
    name: draft.name.trim(),
    rounds,
    finalists: filled(draft.finalists),
    winners: filled(draft.winners),
    ...(draft.checked ? { checked: true } : {}),
  };
}

/** What still has to be typed into a show, for the collapsed rows that have no fields on show. */
export function missingFrom(show: Show | undefined, parsed: ParsedShow): string[] {
  // An unrecorded show is every gap at once, so it reads the same as one saved empty.
  const entered = show ?? { name: "", rounds: [], finalists: [], winners: [] };

  const gaps: string[] = [];
  if (!entered.name.trim()) gaps.push("name");

  const races = entered.rounds
    .map((round, index) => (round.type === "race" && !round.first ? index + 1 : 0))
    .filter(Boolean);
  if (races.length > 0) gaps.push(`first place in round ${races.join(", ")}`);

  const behind = parsed.rounds.length - entered.rounds.length;
  if (behind > 0) gaps.push(`${behind} round${behind === 1 ? "" : "s"} not entered`);

  if ((entered.finalists ?? []).length === 0) gaps.push("finalists");
  if ((entered.winners ?? []).length === 0) gaps.push("winners");

  return gaps;
}

export function validate(draft: ShowDraft): string[] {
  const problems: string[] = [];

  if (!draft.name.trim()) problems.push("Give the show a name.");

  const finalists = filled(draft.finalists);
  const twice = finalists.filter((name, index) => finalists.indexOf(name) !== index);
  for (const name of new Set(twice)) problems.push(`${name} is listed twice as a finalist.`);

  return problems;
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

/** The same keys `nameInput` files its fields under, so a source can be looked up per field. */
function fieldKey(showIndex: number, fill: SlotFill, slot: number): string {
  if (fill.slot === "first") return `show:${showIndex}:round:${fill.roundIndex}:first`;
  return `show:${showIndex}:${fill.slot === "finalists" ? "finalist" : "winner"}:${slot}`;
}

/** What the page remembers between polls: where each name came from, and what has been used. */
export interface FillMemo {
  /** Field key to the capture its name was read off. */
  sources: Map<string, string>;
  /** Fills already spent, so clearing a field does not summon the same name back. */
  applied: Set<string>;
}

export function newFillMemo(): FillMemo {
  return { sources: new Map(), applied: new Set() };
}

/**
 * Drops read names into blank fields only. A field already holding something was either typed or
 * corrected, and a later capture disagreeing with it must not undo that. A fill is spent once
 * used, so a field emptied on purpose stays empty.
 */
export function applyFills(
  draft: ShowDraft,
  fills: SlotFill[],
  showIndex: number,
  memo: FillMemo,
): boolean {
  let changed = false;

  for (const fill of fills) {
    if (fill.showIndex !== showIndex) continue;

    if (fill.slot === "first") {
      const round = fill.roundIndex === undefined ? undefined : draft.rounds[fill.roundIndex];
      const name = fill.names[0];
      const key = fieldKey(showIndex, fill, 0);
      if (round && !round.first && name && !memo.applied.has(`${key}=${name}`)) {
        round.first = name;
        memo.sources.set(key, fill.from);
        memo.applied.add(`${key}=${name}`);
        changed = true;
      }
      continue;
    }

    const slot = fill.slot === "finalists" ? draft.finalists : draft.winners;
    for (const name of fill.names) {
      if (slot.includes(name)) continue;
      if (memo.applied.has(`${showIndex}:${fill.slot}=${name}`)) continue;
      const blank = slot.indexOf("");
      if (blank === -1) break;
      slot[blank] = name;
      memo.sources.set(fieldKey(showIndex, fill, blank), fill.from);
      memo.applied.add(`${showIndex}:${fill.slot}=${name}`);
      changed = true;
    }
  }

  return changed;
}
