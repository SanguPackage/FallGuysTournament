import { basename } from "node:path";
import type { ParsedShow } from "../log";
import type { SlotFill } from "../ocr/autofill";
import type { ShotRead } from "../ocr/read";
import { absoluteTimes, type PlacedShot } from "../screenshots";
import { column, duration, type Mark } from "./format";
import type { Entry } from "./transcript";

export interface Observed {
  shows: ParsedShow[];
  date: string;
  shots: PlacedShot[];
  reads: Record<string, ShotRead>;
  fills: SlotFill[];
}

const NAME_COLUMN = 8;

function markFor(matched: boolean[], names: string[]): Mark {
  const at = matched.indexOf(false);
  return at === -1 ? { kind: "ok", text: "roster" } : { kind: "warn", text: `"${names[at]}"` };
}

function fillKey(fill: SlotFill): string {
  return `${fill.showIndex}:${fill.roundIndex ?? "-"}:${fill.slot}:${fill.names.join("|")}:${fill.from}`;
}

function fieldOf(fill: SlotFill): string {
  if (fill.slot === "winners") return `show ${fill.showIndex + 1} · winners`;
  return `round ${(fill.roundIndex ?? 0) + 1} · ${fill.slot}`;
}

/**
 * Turns the state the admin polls into the lines that state has not produced yet.
 *
 * The server learns everything by re-reading the whole log and the whole capture folder every few
 * seconds, so every poll re-offers what the last one already said. What is new is the only thing
 * worth a line, and that is the one thing the poll itself cannot tell you.
 */
export class Reporter {
  private readonly seen = new Set<string>();

  private fresh(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  observe(state: Observed): Entry[] {
    const lines: Entry[] = [];
    const times = absoluteTimes(state.shows, state.date);

    state.shows.forEach((show, index) => {
      const at = times[index]!;
      const number = index + 1;

      if (at.startedAt !== undefined && this.fresh(`show:${index}`)) {
        const lobby = show.players ?? show.rounds[0]?.present.length;
        lines.push({
          kind: "show",
          at: at.startedAt,
          number,
          name: show.showId,
          note: lobby === undefined ? "lobby size unknown" : `${lobby} in the lobby`,
        });
      }

      show.rounds.forEach((round, roundIndex) => {
        const started = at.rounds[roundIndex];
        if (started !== undefined && this.fresh(`round:${index}:${roundIndex}`)) {
          lines.push({ kind: "round", at: started, number: roundIndex + 1, map: round.name, type: round.type });
        }

        const first = at.firsts[roundIndex];
        if (first !== undefined && this.fresh(`first:${index}:${roundIndex}`)) {
          const verb = round.type === "race" ? "first across the line" : "first through";
          lines.push({ kind: "entry", at: first, lane: "log", text: `${verb} · bean ${round.qualified[0]}` });
        }

        const ended = at.ends[roundIndex];
        // `ends[i]` is the last result *so far*: while the round is being played it walks forward
        // with every qualifier, and the outcome walks with it — a round that will end 22 qualified
        // reads as timed out from its first elimination. Neither stands until the round is done,
        // which is when the next one has loaded or the show has been won.
        const over = roundIndex < show.rounds.length - 1 || show.wonAt !== undefined;
        if (ended !== undefined && over && this.fresh(`over:${index}:${roundIndex}`)) {
          const outcome = round.timedOut
            ? "timed out · nobody qualified"
            : `${round.qualified.length} qualified, ${round.eliminated.length} out`;
          lines.push({ kind: "entry", at: ended, lane: "log", text: `round over · ${outcome}` });
        }
      });

      if (at.wonAt !== undefined && this.fresh(`won:${index}`)) {
        lines.push({
          kind: "entry",
          at: at.wonAt,
          lane: "log",
          star: true,
          text: `show won · bean ${show.winnerId}`,
        });
        const winner = state.fills.find((fill) => fill.showIndex === index && fill.slot === "winners");
        const rounds = `${show.rounds.length} round${show.rounds.length === 1 ? "" : "s"}`;
        const took = at.startedAt === undefined ? undefined : duration(at.wonAt - at.startedAt);
        lines.push({
          kind: "closed",
          at: at.wonAt,
          number,
          note: [rounds, took, `won by ${winner?.names[0] ?? `bean ${show.winnerId}`}`].filter(Boolean).join(" · "),
        });
      }
    });

    for (const shot of state.shots) {
      if (this.fresh(`shot:${shot.file}@${shot.takenAt}`)) {
        const where =
          shot.showIndex === undefined
            ? "outside every show"
            : `show ${shot.showIndex + 1} · ${shot.slot ?? "unplaced"}`;
        lines.push({
          kind: "entry",
          at: shot.takenAt,
          lane: shot.source === "auto" ? "shots" : "shot",
          // Only the name: a capture's folder is its show, which the line already names.
          text: `${column(shot.source, NAME_COLUMN)}${basename(shot.file)} → ${where}`,
        });
      }

      const read = state.reads[shot.file];
      // Keyed on what was read, so re-reading a capture that now says something else says it again.
      if (read && this.fresh(`read:${shot.file}:${JSON.stringify(read)}`)) {
        lines.push(this.readLine(shot, read, state.fills));
      }
    }

    for (const fill of state.fills) {
      if (!this.fresh(`fill:${fillKey(fill)}`)) continue;
      const shot = state.shots.find((candidate) => candidate.file === fill.from);
      lines.push({
        kind: "entry",
        at: shot?.takenAt ?? Date.now(),
        lane: "fill",
        text: `${fieldOf(fill)} ← ${fill.names.length > 2 ? `${fill.names.length} names` : fill.names.join(", ")}`,
        mark: markFor(fill.matched, fill.names),
      });
    }

    return lines.sort((a, b) => ("at" in a ? a.at : 0) - ("at" in b ? b.at : 0));
  }

  private readLine(shot: PlacedShot, read: ShotRead, fills: SlotFill[]): Entry {
    const said = read.screen === undefined
      ? "nothing worth reading"
      : read.tokens.length > 1
        ? `${read.tokens.length} names`
        : `"${read.tokens[0] ?? ""}"`;
    const line: Entry = {
      kind: "entry",
      at: shot.takenAt,
      lane: "ocr",
      text: `${column(read.screen ?? "·", NAME_COLUMN)}${basename(shot.file)} → ${said}`,
    };

    const from = fills.find((fill) => fill.from === shot.file);
    return from ? { ...line, mark: markFor(from.matched, from.names) } : line;
  }
}
