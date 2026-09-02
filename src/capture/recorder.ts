export interface Spawned {
  exited: Promise<number>;
  kill(): void;
}

export interface RecorderStatus {
  running: boolean;
  /** Whether the recording that is running has sound. */
  audio: boolean;
  /** Wall clock the recording started, which is what segment times are measured from. */
  since?: number;
  error?: string;
}

export interface RecorderOptions {
  argvFor: (audio: boolean) => string[];
  spawn: (argv: string[]) => Spawned;
  now: () => number;
  /** How long to wait before starting a recording again after one died. */
  retryMs?: number;
}

/** How soon after starting an exit counts as "that input would not open" rather than a crash. */
const IMMEDIATE_MS = 3000;

export class Recorder {
  private process?: Spawned;
  private stopped = true;
  private audio = true;
  private since?: number;
  private error?: string;
  private readonly retryMs: number;

  constructor(private readonly options: RecorderOptions) {
    this.retryMs = options.retryMs ?? 10_000;
  }

  /** When the running recording began. Segment times are relative to this. */
  startedAt(): number | undefined {
    return this.since;
  }

  status(): RecorderStatus {
    return {
      running: this.process !== undefined,
      audio: this.audio,
      ...(this.since === undefined ? {} : { since: this.since }),
      ...(this.error === undefined ? {} : { error: this.error }),
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.audio = true;
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.process?.kill();
    this.process = undefined;
    this.since = undefined;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const startedAt = this.options.now();
      const process = this.options.spawn(this.options.argvFor(this.audio));
      this.process = process;
      this.since = startedAt;
      this.error = undefined;

      const code = await process.exited;
      if (this.stopped) return;

      this.process = undefined;
      this.since = undefined;
      this.error = `ffmpeg exit ${code}`;

      // An input that will not open fails at once. Sound is worth having, but never at the cost of
      // recording nothing, so the next attempt drops it.
      if (this.audio && this.options.now() - startedAt < IMMEDIATE_MS) {
        this.audio = false;
        continue;
      }

      await Bun.sleep(this.retryMs);
    }
  }
}
