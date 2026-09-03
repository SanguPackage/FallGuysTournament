import type { ReadCache } from "./cache";
import type { ShotRead } from "./read";

export interface Job {
  key: string;
  path: string;
}

/** What the queue is doing, for whoever is reporting it. Nothing here changes what gets read. */
export type QueueEvent =
  | { kind: "queued"; waiting: number }
  | { kind: "reading"; at: number; of: number; path: string }
  | { kind: "drained"; read: number; took: number };

/**
 * One capture at a time in the background. The admin polls every few seconds and must never wait
 * on a read, so results are collected here and the endpoint answers from the cache.
 */
export class ReadQueue {
  private readonly done: ReadCache = {};
  private readonly queued = new Set<string>();
  private pending: Job[] = [];
  private running?: Promise<void>;

  constructor(
    private readonly read: (path: string) => Promise<ShotRead>,
    private readonly report: (event: QueueEvent) => void = () => {},
  ) {}

  cache(): ReadCache {
    return this.done;
  }

  /**
   * Drops what was read for these captures, so the next offer reads them again. The cache is keyed
   * by name and mtime, which a change to the reader itself does not move.
   */
  forget(keys: string[]): void {
    for (const key of keys) {
      delete this.done[key];
      this.queued.delete(key);
    }
  }

  offer(jobs: Job[]): void {
    let taken = 0;
    for (const job of jobs) {
      if (this.queued.has(job.key) || this.done[job.key]) continue;
      this.queued.add(job.key);
      this.pending.push(job);
      taken += 1;
    }
    if (taken > 0) this.report({ kind: "queued", waiting: this.pending.length });
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
  }

  /** Resolves once nothing is left to read. Used by the tests; the server never waits. */
  async drained(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    const startedAt = Date.now();
    // Counted rather than measured off `pending`, which grows under a run that is already going.
    let read = 0;
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      read += 1;
      this.report({ kind: "reading", at: read, of: read + this.pending.length, path: job.path });
      try {
        this.done[job.key] = await this.read(job.path);
      } catch {
        // A capture still being written cannot be read. Record the miss so it is not retried.
        this.done[job.key] = { tokens: [] };
      }
    }
    this.report({ kind: "drained", read, took: Date.now() - startedAt });
  }
}
