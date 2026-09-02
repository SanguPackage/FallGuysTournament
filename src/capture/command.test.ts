import { expect, test } from "bun:test";
import { concatList, cutArgv, extractArgv, recordArgv } from "./command";

// The binary is launched by Bun, so it stays in WSL form. Every path handed *to* ffmpeg has been
// through toWindows by the time it reaches here.
const FFMPEG = "/mnt/c/Program Files/ShareX/ffmpeg.exe";

test("recording grabs the named monitor and segments with a csv list", () => {
  const argv = recordArgv({
    ffmpeg: FFMPEG,
    output: 1,
    audioDevice: "virtual-audio-capturer",
    dir: "C:\\FallGuysCapture\\segments",
    fps: 30,
    segmentSeconds: 30,
  });
  expect(argv[0]).toBe(FFMPEG);
  expect(argv).toContain("ddagrab=output_idx=1:framerate=30,hwdownload,format=bgra");
  expect(argv).toContain("audio=virtual-audio-capturer");
  expect(argv).toContain("h264_qsv");
  expect(argv).toContain("aac");
  expect(argv).toContain("C:\\FallGuysCapture\\segments\\segments.csv");
  expect(argv.at(-1)).toBe("C:\\FallGuysCapture\\segments\\seg-%05d.mkv");
  // A keyframe every second is what bounds a -c copy cut to ~1s of where it was asked to start.
  expect(argv[argv.indexOf("-g") + 1]).toBe("30");
});

test("recording without an audio device asks for no audio at all", () => {
  const argv = recordArgv({
    ffmpeg: FFMPEG,
    output: 0,
    dir: "C:\\seg",
    fps: 30,
    segmentSeconds: 30,
  });
  expect(argv.join(" ")).not.toContain("dshow");
  expect(argv).not.toContain("aac");
});

test("extraction seeks the segment, takes a duration, and numbers the frames", () => {
  const argv = extractArgv({
    ffmpeg: FFMPEG,
    segment: "C:\\seg\\seg-00003.mkv",
    offset: 12.5,
    duration: 2,
    fps: 30,
    pattern: "C:\\scratch\\f-%04d.jpg",
  });
  expect(argv[argv.indexOf("-ss") + 1]).toBe("12.5");
  expect(argv[argv.indexOf("-t") + 1]).toBe("2");
  expect(argv[argv.indexOf("-i") + 1]).toBe("C:\\seg\\seg-00003.mkv");
  expect(argv).toContain("fps=30");
  expect(argv.at(-1)).toBe("C:\\scratch\\f-%04d.jpg");
  // -ss before -i is the fast seek; after -i it decodes the whole segment to get there.
  expect(argv.indexOf("-ss")).toBeLessThan(argv.indexOf("-i"));
});

test("a concat list quotes one file per line, as the demuxer wants", () => {
  expect(concatList(["seg-00000.mkv", "seg-00001.mkv"])).toBe(
    "file 'seg-00000.mkv'\nfile 'seg-00001.mkv'\n",
  );
});

test("a cut copies the streams rather than re-encoding them", () => {
  const argv = cutArgv({
    ffmpeg: FFMPEG,
    list: "C:\\seg\\list-3.txt",
    offset: 4,
    duration: 620.5,
    out: "C:\\FallGuysCapture\\shows\\show-03-slime-climb.mp4",
  });
  expect(argv).toContain("concat");
  expect(argv[argv.indexOf("-i") + 1]).toBe("C:\\seg\\list-3.txt");
  expect(argv[argv.indexOf("-ss") + 1]).toBe("4");
  expect(argv[argv.indexOf("-t") + 1]).toBe("620.5");
  expect(argv[argv.indexOf("-c") + 1]).toBe("copy");
  expect(argv.at(-1)).toBe("C:\\FallGuysCapture\\shows\\show-03-slime-climb.mp4");
});
