/** Ctrl-C, a `kill`, and the terminal being closed under it. */
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/**
 * ffmpeg is a separate process and outlives whatever spawned it, so a server that leaves without
 * stopping the recording leaves it running: the next start records the same screen a second time,
 * onto the same disk.
 */
export function onShutdown(
  stop: () => void,
  exit: () => void,
  on: (signal: string, handler: () => void) => void = (signal, handler) =>
    void process.on(signal as NodeJS.Signals, handler),
): void {
  let leaving = false;

  for (const signal of SIGNALS) {
    on(signal, () => {
      if (leaving) return;
      leaving = true;
      // A recorder that is already gone must not keep the server from leaving.
      try {
        stop();
      } catch {}
      exit();
    });
  }
}
