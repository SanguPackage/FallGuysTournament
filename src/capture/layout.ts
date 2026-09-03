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
 * Local time, because the event is a local evening — the same reasoning `runFolder` is named by.
 * Minutes are enough: two shows cannot start in the same one.
 */
export function showFolder(startedAt: number, slug: string): string {
  const date = new Date(startedAt);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}h${pad(date.getMinutes())}`;
  return `show-${day}T${clock}${slug ? `-${slug}` : ""}`;
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
