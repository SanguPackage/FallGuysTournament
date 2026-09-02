import { expect, test } from "bun:test";
import { Recorder, type Spawned } from "./recorder";

function fakeSpawn(exits: number[]) {
  const calls: string[][] = [];
  let next = 0;
  const spawn = (argv: string[]): Spawned => {
    calls.push(argv);
    // The loop retries faster than the list is long, so the last code stands for every attempt
    // after it. Defaulting to 0 would make an exhausted list read as a recording that succeeded.
    const code = exits[Math.min(next++, exits.length - 1)]!;
    return {
      // -1 stands for a recording that is still running.
      exited: code === -1 ? new Promise<number>(() => {}) : Promise.resolve(code),
      kill() {},
    };
  };
  return { spawn, calls };
}

const argvFor = (audio: boolean, runDir: string) =>
  audio ? ["ff", "-i", "audio", runDir] : ["ff", "silent", runDir];

function runs() {
  let n = 0;
  return () => `/caps/segments/run-${++n}`;
}

test("recording starts with audio and reports itself running", async () => {
  const { spawn, calls } = fakeSpawn([-1]);
  const recorder = new Recorder({ argvFor, newRun: runs(), spawn, now: () => 1000 });
  recorder.start();
  await Bun.sleep(5);
  expect(calls).toEqual([["ff", "-i", "audio", "/caps/segments/run-1"]]);
  expect(recorder.status()).toEqual({ running: true, audio: true, since: 1000 });
});

test("an audio device that will not open falls back to video only rather than to nothing", async () => {
  const { spawn, calls } = fakeSpawn([1, -1]);
  const recorder = new Recorder({ argvFor, newRun: runs(), spawn, now: () => 2000 });
  recorder.start();
  await Bun.sleep(20);
  expect(calls).toEqual([
    ["ff", "-i", "audio", "/caps/segments/run-1"],
    ["ff", "silent", "/caps/segments/run-2"],
  ]);
  expect(recorder.status()).toEqual({ running: true, audio: false, since: 2000 });
});

test("a recorder that has been stopped does not restart itself", async () => {
  const { spawn, calls } = fakeSpawn([1, 1, -1]);
  const recorder = new Recorder({ argvFor, newRun: runs(), spawn, now: () => 0, retryMs: 1 });
  recorder.start();
  await Bun.sleep(5);
  recorder.stop();
  const seen = calls.length;
  await Bun.sleep(20);
  expect(calls.length).toBe(seen);
  expect(recorder.status().running).toBe(false);
});

test("a recording that dies is retried, and the failure is on the status", async () => {
  const { spawn } = fakeSpawn([1, 1, 1, 1]);
  const recorder = new Recorder({ argvFor, newRun: runs(), spawn, now: () => 0, retryMs: 1 });
  recorder.start();
  await Bun.sleep(20);
  const status = recorder.status();
  expect(status.running).toBe(false);
  expect(status.error).toContain("exit 1");
  recorder.stop();
});

test("each spawn records into a folder of its own", async () => {
  const { spawn, calls } = fakeSpawn([1, -1]);
  const recorder = new Recorder({ argvFor, newRun: runs(), spawn, now: () => 2000, retryMs: 1 });
  recorder.start();
  await Bun.sleep(20);
  expect(calls.map((argv) => argv.at(-1))).toEqual([
    "/caps/segments/run-1",
    "/caps/segments/run-2",
  ]);
  recorder.stop();
});

test("every run is remembered with the clock it started on, so a crash loses nothing", async () => {
  const { spawn } = fakeSpawn([1, -1]);
  let clock = 5000;
  const recorder = new Recorder({
    argvFor,
    newRun: runs(),
    spawn,
    now: () => (clock += 1000),
    retryMs: 1,
  });
  recorder.start();
  await Bun.sleep(20);
  expect(recorder.runs()).toEqual([
    { dir: "/caps/segments/run-1", startedAt: 6000 },
    { dir: "/caps/segments/run-2", startedAt: 8000 },
  ]);
  recorder.stop();
});
