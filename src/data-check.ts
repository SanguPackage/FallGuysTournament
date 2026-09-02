import { ROUND_TYPES } from "./rounds";

export interface DataProblem {
  file: string;
  problem: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function names(value: unknown): boolean {
  return Array.isArray(value) && value.every((name) => typeof name === "string");
}

/**
 * What the published board reads without any guard of its own: a field of the wrong shape here is
 * a blank or a crashed page for everyone watching, so it must never reach a push.
 */
export function checkEvent(value: unknown): string[] {
  if (!isObject(value)) return ["is not an object"];

  const problems: string[] = [];
  for (const key of ["name", "date"] as const) {
    if (typeof value[key] !== "string") problems.push(`${key} is not a string`);
  }

  if (!Array.isArray(value.shows)) problems.push("shows is not an array");
  else {
    value.shows.forEach((show, index) => {
      const at = `shows[${index}]`;
      if (!isObject(show)) return void problems.push(`${at} is not an object`);
      if (typeof show.name !== "string") problems.push(`${at}.name is not a string`);

      for (const key of ["finalists", "winners"] as const) {
        if (show[key] !== undefined && !names(show[key])) {
          problems.push(`${at}.${key} is not an array of names`);
        }
      }

      if (show.checked !== undefined && typeof show.checked !== "boolean") {
        problems.push(`${at}.checked is not true or false`);
      }

      if (!Array.isArray(show.rounds)) return void problems.push(`${at}.rounds is not an array`);
      show.rounds.forEach((round, roundIndex) => {
        const on = `${at}.rounds[${roundIndex}]`;
        if (!isObject(round)) return void problems.push(`${on} is not an object`);
        if (typeof round.map !== "string") problems.push(`${on}.map is not a string`);
        if (!ROUND_TYPES.includes(round.type as never)) {
          problems.push(`${on}.type is not a round type: ${JSON.stringify(round.type)}`);
        }
        if (round.first !== undefined && typeof round.first !== "string") {
          problems.push(`${on}.first is not a string`);
        }
      });
    });
  }

  if (!Array.isArray(value.penalties)) problems.push("penalties is not an array");
  else {
    value.penalties.forEach((penalty, index) => {
      const at = `penalties[${index}]`;
      if (!isObject(penalty)) return void problems.push(`${at} is not an object`);
      if (typeof penalty.ingame !== "string") problems.push(`${at}.ingame is not a string`);
      if (typeof penalty.points !== "number") problems.push(`${at}.points is not a number`);
      if (typeof penalty.reason !== "string") problems.push(`${at}.reason is not a string`);
    });
  }

  return problems;
}

export function checkPlayers(value: unknown): string[] {
  if (!isObject(value)) return ["is not an object"];
  if (!Array.isArray(value.players)) return ["players is not an array"];

  const problems: string[] = [];
  value.players.forEach((player, index) => {
    const at = `players[${index}]`;
    if (!isObject(player)) return void problems.push(`${at} is not an object`);
    if (typeof player.fom !== "string") problems.push(`${at}.fom is not a string`);
    for (const key of ["ingame", "discord"] as const) {
      if (player[key] !== undefined && typeof player[key] !== "string") {
        problems.push(`${at}.${key} is not a string`);
      }
    }
    if (player.admin !== undefined && typeof player.admin !== "boolean") {
      problems.push(`${at}.admin is not true or false`);
    }
  });
  return problems;
}

const CHECKED: Record<string, (value: unknown) => string[]> = {
  "event.json": checkEvent,
  "players.json": checkPlayers,
};

/** Every problem the published board would hit, so one bad field never costs the whole site. */
export async function checkData(dir = "data"): Promise<DataProblem[]> {
  const problems: DataProblem[] = [];

  for (const [file, check] of Object.entries(CHECKED)) {
    const handle = Bun.file(`${dir}/${file}`);
    if (!(await handle.exists())) {
      problems.push({ file, problem: "is missing" });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = await handle.json();
    } catch {
      problems.push({ file, problem: "is not valid JSON" });
      continue;
    }

    for (const problem of check(parsed)) problems.push({ file, problem });
  }

  return problems;
}
