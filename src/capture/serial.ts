/** Background work, one job at a time. The request that queued it never waits. */
export class Serial {
  private pending: { key: string; job: () => Promise<void> }[] = [];
  private running?: Promise<void>;
  private inFlight?: string;

  /**
   * A key already waiting or running is dropped. The sweep re-offers every unfinished moment every
   * few seconds, and a moment takes far longer than that to cut, so without this the queue grows
   * faster than it drains and a round played now waits behind hours of duplicates.
   */
  add(key: string, job: () => Promise<void>): void {
    if (this.inFlight === key) return;
    if (this.pending.some((queued) => queued.key === key)) return;
    this.pending.push({ key, job });
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
  }

  /** Resolves once nothing is left. Used by the tests; the server never waits. */
  async drained(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    while (this.pending.length > 0) {
      const { key, job } = this.pending.shift()!;
      this.inFlight = key;
      try {
        await job();
      } catch (error) {
        console.error(`capture job failed — ${String(error)}`);
      } finally {
        this.inFlight = undefined;
      }
    }
  }
}
