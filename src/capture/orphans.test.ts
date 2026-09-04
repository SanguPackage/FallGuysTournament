import { expect, test } from "bun:test";
import { orphanPids } from "./orphans";

const SEGMENTS = "C:\\temp\\FallGuysCapture\\segments";

const recorder = (pid: number, dir = "2026-09-04T13h05m12") => ({
  pid,
  command: `/init ffmpeg.exe -f segment -segment_list ${SEGMENTS}\\${dir}\\segments.csv`,
});

test("finds a recording left behind by a server that is gone", () => {
  expect(orphanPids([recorder(101), recorder(202, "2026-09-04T13h58m04")], SEGMENTS, 1)).toEqual([
    101, 202,
  ]);
});

test("leaves the ffmpeg cutting frames alone", () => {
  const cutting = {
    pid: 303,
    command: "/init ffmpeg.exe -ss 12 -i C:\\temp\\FallGuysCapture\\scratch\\p0-%04d.jpg",
  };

  expect(orphanPids([cutting], SEGMENTS, 1)).toEqual([]);
});

test("leaves a recording writing somewhere else alone", () => {
  const other = {
    pid: 404,
    command: "/init ffmpeg.exe -segment_list D:\\OBS\\segments\\run\\segments.csv",
  };

  expect(orphanPids([other], SEGMENTS, 1)).toEqual([]);
});

/** The server reads its own command line too, and killing itself is not the idea. */
test("never returns the asking process", () => {
  expect(orphanPids([{ ...recorder(7), pid: 7 }], SEGMENTS, 7)).toEqual([]);
});
