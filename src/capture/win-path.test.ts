import { expect, test } from "bun:test";
import { toWindows } from "./win-path";

test("a WSL mount becomes a drive letter with backslashes", () => {
  expect(toWindows("/mnt/c/FallGuysCapture/segments")).toBe("C:\\FallGuysCapture\\segments");
});

test("the drive letter is capitalised", () => {
  expect(toWindows("/mnt/d/caps")).toBe("D:\\caps");
});

test("a mount root becomes the drive root", () => {
  expect(toWindows("/mnt/c")).toBe("C:\\");
});

test("a path that is already a Windows path is left alone", () => {
  expect(toWindows("C:\\FallGuysCapture")).toBe("C:\\FallGuysCapture");
});

test("a path on no drive is left alone rather than mangled", () => {
  expect(toWindows("/home/wouter/scratch")).toBe("/home/wouter/scratch");
});

test("an ffmpeg number pattern survives the conversion", () => {
  expect(toWindows("/mnt/c/x/scratch/p0-%04d.jpg")).toBe("C:\\x\\scratch\\p0-%04d.jpg");
});
