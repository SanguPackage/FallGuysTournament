import type { MomentKind } from "./moments";
import { suggestShowName } from "../../site/admin-model";
import type { ParsedShow } from "../log";
import { absoluteTimes } from "../screenshots";

/** What each moment is called in a file name. The code's own words are too terse to browse by. */
const KIND: Record<MomentKind, string> = {
  first: "first-race-finisher",
  finalists: "finalists-board",
  field: "whole-field",
  winner: "winner",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Rounds are numbered from 1 here, as the admin and the board show them. */
export function captureFile(kind: MomentKind, roundNumber: number, index: number): string {
  return `round-${pad(roundNumber)}-${KIND[kind]}-${pad(index)}.jpg`;
}

/**
 * What a show is, once and for both the things that have to agree on it: the clock its first round
 * loaded at. Its position in the log is not an identity — Fall Guys rotates `Player.log` on launch
 * and the parse starts again from show 0 — but the minute it began is, because two shows cannot
 * start in the same one.
 *
 * Local time, because the event is a local evening — the same reasoning `runFolder` is named by.
 */
export function showStamp(startedAt: number): string {
  const date = new Date(startedAt);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}h${pad(date.getMinutes())}`;
}

export function showFolder(startedAt: number, slug: string): string {
  return `show-${showStamp(startedAt)}-${slug}`;
}

export function slugOf(shows: ParsedShow[], showIndex: number): string {
  return suggestShowName(shows, showIndex)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface ShowFolder {
  showIndex: number;
  /** Folder name, relative to the shows root. */
  dir: string;
  /** The show's own start, so the lines that announce it are in its transcript. */
  from: number;
  /** The next show's start, or open-ended for the one still being played. */
  to: number;
}

/**
 * Which folder each show owns and which span of the evening belongs to it. Naming, transcript
 * slicing and the folder filter all read this, so they cannot disagree about where a show ends.
 *
 * A show whose first round has not loaded is left out: there is nothing to name a folder after and
 * nothing yet to put in it.
 */
export function showsOnDisk(shows: ParsedShow[], date: string): ShowFolder[] {
  const times = absoluteTimes(shows, date);
  const folders: ShowFolder[] = [];

  times.forEach((span, showIndex) => {
    const firstRound = span.rounds.find((start) => start !== undefined);
    if (firstRound === undefined) return;
    const next = times.slice(showIndex + 1).find((later) => later.startedAt !== undefined);
    folders.push({
      showIndex,
      dir: showFolder(firstRound, slugOf(shows, showIndex)),
      from: span.startedAt ?? firstRound,
      to: next?.startedAt ?? Infinity,
    });
  });

  return folders;
}

const FOLDER = /^show-(\d{4}-\d{2}-\d{2})T\d{2}h\d{2}(?:-.*)?$/;

const DAY_MS = 86_400_000;

/**
 * The folders of one evening. Two days, never one: a session that runs past midnight names its
 * later shows for the day after the event's.
 */
export function showDirsFor(names: string[], date: string): string[] {
  const day = Date.parse(`${date}T00:00:00Z`);
  const nights = new Set([date, new Date(day + DAY_MS).toISOString().slice(0, 10)]);
  return names.filter((name) => {
    const stamped = FOLDER.exec(name);
    return stamped !== null && nights.has(stamped[1]!);
  });
}

/** No extension: `cutShowClip` adds `.mp4`. */
export function clipFile(date: string, showIndex: number, slug: string): string {
  return `${date}-show-${pad(showIndex + 1)}-${slug}`;
}
