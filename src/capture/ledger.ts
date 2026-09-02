/**
 * Attempts are only spent once the recording has passed a moment's window, so these are three
 * goes at footage that is on disk rather than three goes at footage still being written.
 */
export const MAX_ATTEMPTS = 3;

export interface LedgerState {
  captured: string[];
  attempts: Record<string, number>;
}

export class Ledger {
  private readonly captured: Set<string>;
  private readonly attempts: Map<string, number>;

  constructor(state?: LedgerState) {
    this.captured = new Set(state?.captured ?? []);
    this.attempts = new Map(Object.entries(state?.attempts ?? {}));
  }

  pending(key: string): boolean {
    return !this.captured.has(key) && (this.attempts.get(key) ?? 0) < MAX_ATTEMPTS;
  }

  done(key: string): void {
    this.captured.add(key);
    this.attempts.delete(key);
  }

  failed(key: string): void {
    this.attempts.set(key, (this.attempts.get(key) ?? 0) + 1);
  }

  state(): LedgerState {
    return {
      captured: [...this.captured],
      attempts: Object.fromEntries(this.attempts),
    };
  }
}
