/** Background work, one job at a time. The request that queued it never waits. */
export class Serial {
  private pending: (() => Promise<void>)[] = [];
  private running?: Promise<void>;

  add(job: () => Promise<void>): void {
    this.pending.push(job);
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
      const job = this.pending.shift()!;
      try {
        await job();
      } catch (error) {
        console.error(`capture job failed — ${String(error)}`);
      }
    }
  }
}
