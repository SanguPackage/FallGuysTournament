import { expect, test } from "bun:test";
import { captureFolders, captureSettings, FFMPEG_DEFAULT, runFolder, runsIn, runStartedAt } from "./paths";

const exists = (paths: string[]) => async (path: string) => paths.includes(path);

test("ShareX's bundled ffmpeg is used when nothing says otherwise", async () => {
  const settings = await captureSettings({}, exists([FFMPEG_DEFAULT]));
  expect(settings.ffmpeg).toBe(FFMPEG_DEFAULT);
});

test("FFMPEG_PATH wins over the bundled one", async () => {
  const settings = await captureSettings(
    { FFMPEG_PATH: "/mnt/d/tools/ffmpeg.exe" },
    exists([FFMPEG_DEFAULT, "/mnt/d/tools/ffmpeg.exe"]),
  );
  expect(settings.ffmpeg).toBe("/mnt/d/tools/ffmpeg.exe");
});

test("no ffmpeg anywhere is reported rather than guessed at", async () => {
  const settings = await captureSettings({}, exists([]));
  expect(settings.ffmpeg).toBeUndefined();
});

test("the capture folder, monitor and audio device come from the environment", async () => {
  const settings = await captureSettings(
    { CAPTURE_DIR: "/mnt/d/caps", CAPTURE_OUTPUT: "1", CAPTURE_AUDIO: "loop-thing" },
    exists([FFMPEG_DEFAULT]),
  );
  expect(settings.dir).toBe("/mnt/d/caps");
  expect(settings.output).toBe(1);
  expect(settings.audioDevice).toBe("loop-thing");
});

test("defaults are the first monitor, /mnt/c/temp/FallGuysCapture and the usual loopback device", async () => {
  const settings = await captureSettings({}, exists([FFMPEG_DEFAULT]));
  expect(settings.dir).toBe("/mnt/c/temp/FallGuysCapture");
  expect(settings.output).toBe(0);
  expect(settings.audioDevice).toBe("virtual-audio-capturer");
});

test("CAPTURE_AUDIO=off records silently", async () => {
  const settings = await captureSettings({ CAPTURE_AUDIO: "off" }, exists([FFMPEG_DEFAULT]));
  expect(settings.audioDevice).toBeUndefined();
});

test("a CAPTURE_OUTPUT that is not a number falls back to the first monitor", async () => {
  const settings = await captureSettings({ CAPTURE_OUTPUT: "left" }, exists([FFMPEG_DEFAULT]));
  expect(settings.output).toBe(0);
});

test("the folders under the capture dir stay in WSL form", () => {
  expect(captureFolders("/mnt/c/FallGuysCapture").segments).toBe("/mnt/c/FallGuysCapture/segments");
});

test("a run folder is named for the local clock, down to the second", () => {
  // Built from local parts so the expectation holds in any timezone.
  const at = new Date(2026, 8, 2, 21, 41, 3).getTime();
  expect(runFolder(at)).toBe("2026-09-02T21h41m03");
});

test("two runs a second apart get different folders", () => {
  const at = new Date(2026, 8, 2, 21, 41, 3).getTime();
  expect(runFolder(at)).not.toBe(runFolder(at + 1000));
});

test("a run folder's name reads back as the clock it was named for", () => {
  const at = new Date(2026, 8, 2, 21, 41, 3).getTime();
  expect(runStartedAt(runFolder(at))).toBe(at);
});

test("the suffix a collision adds does not change the clock read back", () => {
  const at = new Date(2026, 8, 2, 21, 41, 3).getTime();
  expect(runStartedAt(`${runFolder(at)}-2`)).toBe(at);
});

test("a folder that is not a run is not read as one", () => {
  expect(runStartedAt("scratch")).toBeUndefined();
});

test("runs left on disk by a server that has exited are still runs", () => {
  const runs = runsIn("/caps/segments", ["2026-09-02T21h41m03", "notes.txt"], []);
  expect(runs).toEqual([
    { dir: "/caps/segments/2026-09-02T21h41m03", startedAt: new Date(2026, 8, 2, 21, 41, 3).getTime() },
  ]);
});

test("a spawn this process made beats the same folder read off disk", () => {
  const spawned = { dir: "/caps/segments/2026-09-02T21h41m03", startedAt: 1_772_000_000_123 };
  const runs = runsIn("/caps/segments", ["2026-09-02T21h41m03"], [spawned]);
  // The name is only good to the second; the recorder saw the spawn to the millisecond.
  expect(runs).toEqual([spawned]);
});
