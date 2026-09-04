/** Background work, one job at a time. The request that queued it never waits. */
export class Serial {
  private pending: { key: string; job: () => Promise<void>; at: number }[] = [];
  private running?: Promise<void>;
  private inFlight?: string;

  /**
   * A key already waiting or running is dropped. The sweep re-offers every unfinished moment every
   * few seconds, and a moment takes far longer than that to cut, so without this the queue grows
   * faster than it drains and a round played now waits behind hours of duplicates.
   *
   * `at` is what the queue is ordered by, latest first — the clock the work belongs to, not the
   * clock it was offered at. The board of the round just played is the one somebody is waiting to
   * read; a moment from a show two shows ago has already missed its audience, and a moment that
   * finds nothing must not take the live one down with it. Work offered without a stamp goes last.
   */
  add(key: string, job: () => Promise<void>, at = Number.NEGATIVE_INFINITY): void {
    if (this.inFlight === key) return;
    if (this.pending.some((queued) => queued.key === key)) return;
    this.pending.push({ key, job, at });
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
      // Chosen when the queue is ready for it, not when it was added: what matters most changes
      // while a job is running, and everything queued behind it has been waiting the same while.
      let next = 0;
      for (let index = 1; index < this.pending.length; index++) {
        if (this.pending[index]!.at > this.pending[next]!.at) next = index;
      }
      const { key, job } = this.pending.splice(next, 1)[0]!;
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
