#!/usr/bin/env bun
import { $ } from "bun";
import {
  addPenalty,
  addRound,
  addShow,
  closeShow,
  currentShow,
  resolvePlayer,
  ValidationError,
} from "./event";
import { score } from "./scoring";
import { playableAt } from "./shows";
import { parseShowOrder } from "../site/rules";
import { loadEvent, loadPlayers, loadShowLimits, saveEvent } from "./storage";
import type { LeaderboardRow, Players, RoundType } from "./types";

function ask(question: string): string {
  const answer = prompt(question);
  if (answer === null) {
    console.log("Aborted.");
    process.exit(1);
  }
  return answer.trim();
}

function askRequired(question: string): string {
  const answer = ask(question);
  if (!answer) throw new ValidationError("A value is required.");
  return answer;
}

function askPlayers(question: string, players: Players): string[] {
  return ask(question)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => resolvePlayer(players, name));
}

async function commit(message: string, noCommit: boolean): Promise<void> {
  if (noCommit) {
    console.log("Saved without committing.");
    return;
  }
  await $`git add data/event.json`.quiet();
  await $`git commit -m ${message}`.quiet();
  const remotes = (await $`git remote`.text()).trim();
  if (!remotes) {
    console.log("Committed. No git remote configured, so nothing was pushed.");
    return;
  }
  try {
    await $`git push`.quiet();
    console.log("Committed and pushed.");
  } catch {
    console.log("Committed, but the push failed. Push manually when you have a connection.");
  }
}

function printBoard(rows: LeaderboardRow[]): void {
  const header = ["#", "FOM", "In-game", "Pts", "Races", "Finals", "Wins"];
  const body = rows.map((row, index) => [
    String(index + 1),
    row.fom,
    row.ingame ?? "—",
    String(row.points),
    String(row.raceWins),
    String(row.finalsReached),
    String(row.finalsWon),
  ]);
  const widths = header.map((_, column) =>
    Math.max(...[header, ...body].map((line) => line[column]!.length)),
  );
  for (const line of [header, ...body]) {
    console.log(
      line
        .map((cell, column) =>
          column === 1 || column === 2 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!),
        )
        .join("  ")
        .trimEnd(),
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noCommit = args.includes("--no-commit");
  const command = args.find((arg) => !arg.startsWith("--"));

  const players = await loadPlayers();
  const event = await loadEvent();

  switch (command) {
    case "show": {
      const name = askRequired("Show name: ");
      addShow(event, name);
      await saveEvent(event);
      await commit(`data: start show ${name}`, noCommit);
      break;
    }
    case "round": {
      const map = askRequired("Map: ");
      const type = ask("Type [race/survival] (default race): ") || "race";
      if (type !== "race" && type !== "survival") {
        throw new ValidationError(`Type must be race or survival, got "${type}".`);
      }
      const first =
        type === "race" ? resolvePlayer(players, askRequired("First across the line: ")) : undefined;
      addRound(event, { map, type: type as RoundType, ...(first ? { first } : {}) });
      await saveEvent(event);
      await commit(`data: record ${map}`, noCommit);
      break;
    }
    case "final": {
      const map = askRequired("Final map: ");
      const finalists = askPlayers("Finalists (comma separated): ", players);
      const winners = askPlayers("Winners (comma separated, blank if none): ", players);
      closeShow(event, { map, finalists, winners });
      await saveEvent(event);
      await commit(`data: close show ${currentShow(event).name}`, noCommit);
      break;
    }
    case "penalty": {
      const ingame = resolvePlayer(players, askRequired("Player: "));
      const points = Number(askRequired("Points (negative to deduct): "));
      if (!Number.isInteger(points)) {
        throw new ValidationError("Points must be a whole number.");
      }
      const reason = askRequired("Reason: ");
      addPenalty(event, { ingame, points, reason });
      await saveEvent(event);
      await commit(`data: penalise ${ingame} ${points}`, noCommit);
      break;
    }
    case "shows": {
      const headcount = Number(args.find((arg) => /^\d+$/.test(arg)) ?? askRequired("How many players? "));
      if (!Number.isInteger(headcount) || headcount < 1) {
        throw new ValidationError("Give a whole number of players.");
      }
      const limits = await loadShowLimits();
      const order = parseShowOrder(await Bun.file("docs/rules.md").text()).map((s) => s.show);
      const { play, skip } = playableAt(limits, order, headcount);
      console.log(`With ${headcount} players:\n`);
      play.forEach((show, index) => console.log(`  ${String(index + 1).padStart(2)}  ${show}`));
      if (skip.length > 0) {
        console.log("\nSkipped:");
        for (const { show, reason } of skip) console.log(`      ${show} — ${reason}`);
      }
      break;
    }
    case "board": {
      printBoard(score(event, players));
      break;
    }
    default:
      console.log("Usage: bun run cli <show|round|final|penalty|shows|board> [--no-commit]");
      process.exit(1);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
