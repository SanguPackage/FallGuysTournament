import type { ParsedShow } from "../src/log";
import { score } from "../src/scoring";
import { finalistsOf, SCORES_FIRST } from "../src/rounds";
import { aliveInto } from "../src/field";

export { ROUND_TYPES, SCORES_FIRST } from "../src/rounds";
import type { Players, Round, RoundType, Show, TournamentEvent } from "../src/types";
import type { SlotFill } from "../src/ocr/autofill";
import type { RecorderStatus } from "../src/capture/recorder";
import type { ShotSource } from "../src/screenshots";

export interface Badge {
  text: string;
  ok: boolean;
  /** Hover text: the ffmpeg exit that killed the recording, when one did. */
  title: string;
}

/**
 * `null` is a server started with `--no-record`, which is a choice; a recorder that is not running
 * is one that died mid-event, which costs the night's captures. Reading the same would hide the
 * second behind the first, so the dead one shouts and the deliberate one does not.
 */
export function captureBadge(capture: RecorderStatus | null): Badge {
  if (!capture) return { text: "recording off", ok: false, title: "" };
  if (!capture.running) return { text: "NOT RECORDING", ok: false, title: capture.error ?? "" };
  return {
    text: capture.audio ? "recording" : "recording — no sound",
    ok: true,
    title: capture.error ?? "",
  };
}

export interface RoundDraft {
  map: string;
  type: RoundType;
  first: string;
  /** One slot per name the log counted through this round. */
  qualified: string[];
  /** The log's own count, which needs no typing and stands in until the names are read. */
  survivors?: number;
  /** Set once the admin picks a type, so the log never overrides their judgement. */
  typeEdited?: boolean;
}

export interface ShowDraft {
  name: string;
  rounds: RoundDraft[];
  winners: string[];
  checked?: boolean;
}

export function draftFor(parsed: ParsedShow, name = ""): ShowDraft {
  const draft: ShowDraft = { name, rounds: [], winners: [] };
  syncDraft(draft, parsed);
  return draft;
}

/**
 * Folds rounds that appeared in the log since the last look into a draft being typed, without
 * touching anything already entered.
 */
export function syncDraft(draft: ShowDraft, parsed: ParsedShow): void {
  for (const round of parsed.rounds.slice(draft.rounds.length)) {
    draft.rounds.push({ map: round.name, type: round.type, first: "", qualified: [] });
  }

  parsed.rounds.forEach((round, index) => {
    const entry = draft.rounds[index];
    if (!entry) return;
    if (!entry.typeEdited) entry.type = round.type;
    fit(entry.qualified, round.qualified.length);
    if (round.qualified.length > 0) entry.survivors = round.qualified.length;
  });

  // parseLog calls the last round a final, but mid-show that is only the round being played.
  const last = parsed.rounds.at(-1);
  const final = last?.type === "final" || parsed.winnerId !== undefined ? last : undefined;

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
      qualified: [...(round.qualified ?? [])],
      ...(round.survivors === undefined ? {} : { survivors: round.survivors }),
      typeEdited: true,
    })),
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
    const qualified = filled(round.qualified);
    return {
      map: round.map,
      type: round.type,
      ...(SCORES_FIRST.has(round.type) && first ? { first } : {}),
      ...(qualified.length > 0 ? { qualified } : {}),
      // The final is crowned by its winner, so its count would only repeat that.
      ...(round.type !== "final" && round.survivors !== undefined
        ? { survivors: round.survivors }
        : {}),
    };
  });

  return {
    name: draft.name.trim(),
    rounds,
    winners: filled(draft.winners),
    ...(draft.checked ? { checked: true } : {}),
  };
}

/**
 * Whether a misfired show can be taken back out of the board.
 *
 * The last one only: `event.shows[i]` is paired by index with the log's parsed show `i`, which the
 * admin rows, the autofill slots, the re-read and the capture folders all read. Removing an
 * earlier show would re-point every later one at the wrong log entry; popping the last cannot.
 */
export function canDeleteShow(event: TournamentEvent, index: number): boolean {
  return index >= 0 && index === event.shows.length - 1;
}

/** What still has to be typed into a show, for the collapsed rows that have no fields on show. */
export function missingFrom(show: Show | undefined, parsed: ParsedShow): string[] {
  // An unrecorded show is every gap at once, so it reads the same as one saved empty.
  const entered: Show = show ?? { name: "", rounds: [], winners: [] };

  const gaps: string[] = [];
  if (!entered.name.trim()) gaps.push("name");

  const races = entered.rounds
    .map((round, index) => (round.type === "race" && !round.first ? index + 1 : 0))
    .filter(Boolean);
  if (races.length > 0) gaps.push(`first place in round ${races.join(", ")}`);

  const behind = parsed.rounds.length - entered.rounds.length;
  if (behind > 0) gaps.push(`${behind} round${behind === 1 ? "" : "s"} not entered`);

  if (finalistsOf(entered).length === 0) gaps.push("finalists");
  if ((entered.winners ?? []).length === 0) gaps.push("winners");

  return gaps;
}

export function validate(draft: ShowDraft): string[] {
  const problems: string[] = [];

  if (!draft.name.trim()) problems.push("Give the show a name.");

  draft.rounds.forEach((round, index) => {
    const names = filled(round.qualified);
    const twice = names.filter((name, at) => names.indexOf(name) !== at);
    for (const name of new Set(twice)) {
      problems.push(`${name} is listed twice as qualifying from round ${index + 1}.`);
    }
  });

  return problems;
}

/** What the publish box starts out saying, so the history reads consistently without typing. */
export function defaultMessage(event: TournamentEvent): string {
  const last = event.shows.at(-1);
  return last ? `data: record show ${event.shows.length} — ${last.name}` : "data: update players";
}

/**
 * A row with neither name is one still being typed, and saving it would publish a blank player.
 * Either name alone is enough: a Fall Guys name comes in before a FOM name as often as after.
 */
export function everyPlayerNamed(players: Players): boolean {
  return players.players.every(
    (player) => player.ingame.trim().length > 0 || (player.fom ?? "").trim().length > 0,
  );
}

/** Every name the admin has already typed into a show, so it can be picked rather than retyped. */
export function namesInShows(event: TournamentEvent): string[] {
  const names = event.shows.flatMap((show) => [
    ...show.rounds.map((round) => round.first),
    ...show.rounds.flatMap((round) => round.qualified ?? []),
    ...(show.winners ?? []),
  ]);
  return [...new Set(names.filter((name): name is string => !!name))].sort();
}

/** Every playing name, best scorer first. */
export function namesByPoints(event: TournamentEvent, players: Players): string[] {
  const competing: string[] = [];
  const away = new Set<string>();
  for (const player of players.players) {
    if (!player.ingame) continue;
    if (player.admin || player.joined === false) away.add(player.ingame);
    else competing.push(player.ingame);
  }

  const points = new Map(
    score(event, players)
      .filter((row) => row.ingame)
      .map((row) => [row.ingame!, row.points]),
  );

  return [...new Set([...competing, ...namesInShows(event)])]
    .filter((name) => !away.has(name))
    .sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || a.localeCompare(b));
}

/** A dropdown is read down looking for a name, which is a search, not a ranking. */
function alphabetically(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Everyone at the LAN who is playing. A reading the roster already claimed is corrected against the
 * roster rather than against whoever a board happened to name, so this is what such a field offers
 * — guests typed into a show are not among them.
 */
export function joinedNames(event: TournamentEvent, players: Players): string[] {
  const joined = new Set(
    players.players.flatMap((player) =>
      player.ingame && !player.admin && player.joined !== false ? [player.ingame] : [],
    ),
  );
  return alphabetically(namesByPoints(event, players).filter((name) => joined.has(name)));
}

/** Which name field is being typed into, so the pool can be cut down to what could go in it. */
export type NameSlot =
  | { slot: "first"; roundIndex: number }
  | { slot: "qualified"; roundIndex: number; at: number }
  | { slot: "winners"; at: number };

/** A board with a slot still empty is one being typed, and eliminates nobody. */
function completeBoards(draft: ShowDraft): Show {
  return {
    name: draft.name,
    winners: [],
    rounds: draft.rounds.map((round) => {
      const names = round.qualified.map((name) => name.trim());
      const complete = names.length > 0 && names.every(Boolean);
      return { map: round.map, type: round.type, ...(complete ? { qualified: names } : {}) };
    }),
  };
}

/**
 * Everyone this show's own screens have named. A public lobby is nearly all strangers, so the
 * roster covers next to none of the survivors and the boards already read are the only list of
 * who is still in.
 */
function namesInDraft(draft: ShowDraft): string[] {
  return [
    ...draft.rounds.flatMap((round) => [round.first, ...round.qualified]),
    ...draft.winners,
  ]
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Everyone a slot could still hold: whoever the boards before it left in, less the names already
 * standing beside it. Whoever crossed a round first qualified out of it, so `first` is offered
 * that round's own survivors rather than the people who went into it.
 */
export function candidatesFor(draft: ShowDraft, names: string[], slot: NameSlot): string[] {
  const show = completeBoards(draft);
  const into =
    slot.slot === "qualified"
      ? slot.roundIndex
      : slot.slot === "first"
        ? slot.roundIndex + 1
        : show.rounds.length;

  const beside =
    slot.slot === "qualified"
      ? (draft.rounds[slot.roundIndex]?.qualified ?? [])
      : slot.slot === "winners"
        ? draft.winners
        : [];
  const at = "at" in slot ? slot.at : -1;
  const taken = new Set(
    beside.flatMap((name, index) => (index === at ? [] : [name.trim()])).filter(Boolean),
  );

  const pool = [...new Set([...names, ...namesInDraft(draft)])];
  return alphabetically(aliveInto(show, pool, into).filter((name) => !taken.has(name)));
}

/** The same keys `nameInput` files its fields under, so a source can be looked up per field. */
function fieldKey(showIndex: number, fill: SlotFill, slot: number): string {
  if (fill.slot === "first") return `show:${showIndex}:round:${fill.roundIndex}:first`;
  if (fill.slot === "qualified") {
    return `show:${showIndex}:round:${fill.roundIndex}:qualified:${slot}`;
  }
  return `show:${showIndex}:winner:${slot}`;
}

/** What the page remembers between polls: where each name came from, and what has been used. */
export interface FillMemo {
  /** Field key to the capture its name was read off. */
  sources: Map<string, string>;
  /** Fills already spent, so clearing a field does not summon the same name back. */
  applied: Set<string>;
  /** Fields holding text no roster entry claimed, which is a reading nobody has confirmed. */
  unmatched: Set<string>;
}

export function newFillMemo(): FillMemo {
  return { sources: new Map(), applied: new Set(), unmatched: new Set() };
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
        if (fill.matched[0] === false) memo.unmatched.add(key);
        memo.applied.add(`${key}=${name}`);
        changed = true;
      }
      continue;
    }

    const round = fill.roundIndex === undefined ? undefined : draft.rounds[fill.roundIndex];
    const slot = fill.slot === "qualified" ? round?.qualified : draft.winners;
    if (!slot) continue;
    const spent = fill.slot === "qualified" ? `${fill.roundIndex}:qualified` : "winners";
    for (const [at, name] of fill.names.entries()) {
      if (slot.includes(name)) continue;
      if (memo.applied.has(`${showIndex}:${spent}=${name}`)) continue;
      const blank = slot.indexOf("");
      if (blank === -1) break;
      slot[blank] = name;
      const key = fieldKey(showIndex, fill, blank);
      memo.sources.set(key, fill.from);
      if (fill.matched[at] === false) memo.unmatched.add(key);
      memo.applied.add(`${showIndex}:${spent}=${name}`);
      changed = true;
    }
  }

  return changed;
}

/**
 * Forgets what was read into one round, so the next poll's fills land there again.
 *
 * Editing `players.json` changes what the names read off a capture match to, but the round is no
 * longer blank, and `applyFills` only writes into blanks. Without this the corrected match arrives
 * every poll and is thrown away.
 *
 * A field typed by hand carries no source, and is left alone: this undoes a reading, not a
 * correction.
 */
export function resyncRound(
  draft: ShowDraft,
  showIndex: number,
  roundIndex: number,
  memo: FillMemo,
): void {
  const round = draft.rounds[roundIndex];
  if (!round) return;

  const firstKey = `show:${showIndex}:round:${roundIndex}:first`;
  if (memo.sources.delete(firstKey)) round.first = "";
  memo.unmatched.delete(firstKey);

  round.qualified.forEach((_, slot) => {
    const key = `show:${showIndex}:round:${roundIndex}:qualified:${slot}`;
    if (memo.sources.delete(key)) round.qualified[slot] = "";
    memo.unmatched.delete(key);
  });

  for (const spent of [...memo.applied]) {
    if (
      spent.startsWith(`${firstKey}=`) ||
      spent.startsWith(`${showIndex}:${roundIndex}:qualified=`)
    ) {
      memo.applied.delete(spent);
    }
  }
}

/**
 * The same for the winners, which is where a final's names live: it scores no first place and has
 * no board of its own, so the show's winners are the only thing read for it.
 */
export function resyncWinners(draft: ShowDraft, showIndex: number, memo: FillMemo): void {
  draft.winners.forEach((_, slot) => {
    const key = `show:${showIndex}:winner:${slot}`;
    if (memo.sources.delete(key)) draft.winners[slot] = "";
    memo.unmatched.delete(key);
  });

  for (const spent of [...memo.applied]) {
    if (spent.startsWith(`${showIndex}:winners=`)) memo.applied.delete(spent);
  }
}

/**
 * Forgets everything read into a show, which is what re-reading the captures needs: a name still
 * held as spent never lands again, however the reader now reads it.
 */
export function resyncShow(draft: ShowDraft, showIndex: number, memo: FillMemo): void {
  draft.rounds.forEach((_, roundIndex) => resyncRound(draft, showIndex, roundIndex, memo));
  resyncWinners(draft, showIndex, memo);
}

/**
 * A capture is enough on its own: the winner screen may have been read into nothing — the names
 * spent on an earlier pass, or claimed by no roster entry — and resync is what puts it back in play.
 */
export function canResyncWinners(
  draft: ShowDraft,
  showIndex: number,
  memo: FillMemo,
  captures: number,
): boolean {
  if (captures > 0) return true;
  return draft.winners.some((_, slot) => memo.sources.has(`show:${showIndex}:winner:${slot}`));
}

/** All a panel knows about a capture when deciding whether to unfold it. */
export interface Capture {
  file: string;
  source: ShotSource;
}

/** The index the pull's own frames are numbered with. See `captureFile`. */
const FRAME = /-\d+\.[a-z]+$/i;

/**
 * The pull a capture came out of, which is what its name is built from: one moment is cut into
 * frames numbered off a single name, and each kind counts its own. Anything ShareX filed stands
 * alone, since the admin pressed the key for it.
 */
function pullOf(shot: Capture): string {
  return shot.source === "auto" ? shot.file.replace(FRAME, "") : shot.file;
}

/**
 * Whether a capture shows its image or only its caption. A pull lands as a handful of frames at
 * once and the readable one is the last, so the frames before it fold themselves away rather than
 * push it off the panel. Every pull keeps one on show, not just the newest. `folded` is what the
 * admin worked by hand, which outranks that either way.
 */
export function showsCapture(
  shots: Capture[],
  file: string,
  folded: Map<string, boolean>,
): boolean {
  const decided = folded.get(file);
  if (decided !== undefined) return !decided;

  const shot = shots.find((candidate) => candidate.file === file);
  if (!shot) return false;
  const pull = pullOf(shot);
  return shots.filter((candidate) => pullOf(candidate) === pull).at(-1)?.file === file;
}
