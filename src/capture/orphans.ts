import { readFileSync, readdirSync } from "node:fs";

export interface Process {
  pid: number;
  command: string;
}

/**
 * The recordings still running that this server did not start. ffmpeg outlives whatever spawned it,
 * so a crash, a `kill -9` or a closed terminal leaves one grabbing the screen: without this the
 * next start records the same monitor twice, onto the same disk.
 *
 * The segment folder is the mark. The ffmpeg cutting frames out of that footage writes elsewhere
 * and is left alone — it is finishing work this server wants.
 */
export function orphanPids(processes: Process[], segmentsDir: string, self: number): number[] {
  return processes
    .filter((process) => process.pid !== self && process.command.includes(segmentsDir))
    .map((process) => process.pid);
}

/** Every process this machine will name, for `orphanPids` to sort through. */
export function processList(): Process[] {
  const processes: Process[] = [];
  for (const entry of readdirSync("/proc")) {
    const pid = Number(entry);
    if (!Number.isInteger(pid)) continue;
    try {
      const command = readFileSync(`/proc/${entry}/cmdline`, "utf8").replace(/\0/g, " ");
      processes.push({ pid, command });
    } catch {}
  }
  return processes;
}
