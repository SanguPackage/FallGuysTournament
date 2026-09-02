import type { ReadCache } from "./cache";
import type { ShotRead } from "./read";

export interface Job {
  key: string;
  path: string;
}

/**
 * One capture at a time in the background. The admin polls every few seconds and must never wait
 * on a read, so results are collected here and the endpoint answers from the cache.
 */
export class ReadQueue {
  private readonly done: ReadCache = {};
  private readonly queued = new Set<string>();
  private pending: Job[] = [];
  private running?: Promise<void>;

  constructor(private readonly read: (path: string) => Promise<ShotRead>) {}

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
    for (const job of jobs) {
      if (this.queued.has(job.key) || this.done[job.key]) continue;
      this.queued.add(job.key);
      this.pending.push(job);
    }
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
  }

  /** Resolves once nothing is left to read. Used by the tests; the server never waits. */
  async drained(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      try {
        this.done[job.key] = await this.read(job.path);
      } catch {
        // A capture still being written cannot be read. Record the miss so it is not retried.
        this.done[job.key] = { tokens: [] };
      }
    }
  }
}
