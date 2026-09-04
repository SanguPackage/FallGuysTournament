import { expect, test } from "bun:test";
import { CLASSIFY_HEIGHT, concatList, cutArgv, extractArgv, recordArgv, thumbArgv } from "./command";

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

test("a concat list quotes one absolute path per line, as the demuxer wants", () => {
  expect(
    concatList([
      "C:\\caps\\segments\\21h41m03\\seg-00002.mkv",
      "C:\\caps\\segments\\21h43m00\\seg-00000.mkv",
    ]),
  ).toBe(
    "file 'C:\\caps\\segments\\21h41m03\\seg-00002.mkv'\nfile 'C:\\caps\\segments\\21h43m00\\seg-00000.mkv'\n",
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

test("a thumbnail is one scaled frame out of a segment", () => {
  const argv = thumbArgv({
    ffmpeg: FFMPEG,
    segment: "C:\\caps\\segments\\21h41m03\\seg-00007.mkv",
    width: 480,
    out: "C:\\caps\\scratch\\recording.jpg",
  });
  expect(argv[argv.indexOf("-i") + 1]).toBe("C:\\caps\\segments\\21h41m03\\seg-00007.mkv");
  expect(argv[argv.indexOf("-frames:v") + 1]).toBe("1");
  expect(argv[argv.indexOf("-vf") + 1]).toBe("scale=480:-1");
  expect(argv.at(-1)).toBe("C:\\caps\\scratch\\recording.jpg");
});

test("frames can be pulled scaled, which is how the search reads them", () => {
  const argv = extractArgv({
    ffmpeg: FFMPEG,
    segment: "C:\\seg\\seg-00003.mkv",
    offset: 0,
    duration: 2,
    fps: 30,
    pattern: "C:\\scratch\\s-%04d.jpg",
    height: CLASSIFY_HEIGHT,
  });
  expect(argv).toContain(`fps=30,scale=-2:${CLASSIFY_HEIGHT}`);
});
