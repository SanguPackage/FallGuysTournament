import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Ledger } from "./ledger";
import { captureMoment, cutShowClip } from "./pipeline";
import type { Moment } from "./moments";

const AT = Date.parse("2026-09-05T20:01:40Z");
const MOMENT: Moment = {
  kind: "first",
  showIndex: 0,
  roundIndex: 2,
  at: AT,
  from: AT - 500,
  to: AT + 1500,
  fps: 30,
};

const SEGMENTS = [{ file: "seg-00003.mkv", from: AT - 20_000, to: AT + 10_000 }];

async function harness() {
  const dir = await mkdtemp(`${tmpdir()}/capture-`);
  const ran: string[][] = [];
  const scratchDir = `${dir}/scratch`;
  return {
    dir,
    ran,
    deps: {
      ffmpeg: "ff",
      segmentDir: `${dir}/segments`,
      scratchDir,
      captureDir: `${dir}/captures`,
      // Stands in for ffmpeg. The argv carries Windows paths, which this process cannot write to,
      // so the frames go where the pipeline will look for them instead.
      run: async (argv: string[]) => {
        ran.push(argv);
        const folder = `${scratchDir}/0-first-2`;
        await mkdir(folder, { recursive: true });
        for (const n of [1, 2]) {
          await writeFile(`${folder}/p0-000${n}.jpg`, "x");
        }
        return { ok: true, stderr: "" };
      },
      frameOf: async () => ({ width: 2, height: 2, at: () => [0, 0, 0] as const }),
      screenOf: () => "toast" as const,
    },
  };
}

test("a moment nothing covers is left pending rather than half captured", async () => {
  const { dir, deps, ran } = await harness();
  const ledger = new Ledger();
  try {
    expect(await captureMoment(MOMENT, [], ledger, deps)).toEqual([]);
    expect(ran).toEqual([]);
    expect(ledger.pending("0:first:2")).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("kept frames land in the capture root with the mtime of the instant they show", async () => {
  const { dir, deps, ran } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SEGMENTS, ledger, deps);
    expect(ran.length).toBe(1);
    expect(ran[0]![0]).toBe("ff");
    expect(kept.length).toBe(2);
    const first = kept[0]!;
    expect(first).toContain("2026-09/auto-1-first-");
    const info = await stat(`${dir}/captures/${first}`);
    // Frame 1 of a 30fps pull that began at `from`.
    expect(Math.round(info.mtimeMs)).toBe(MOMENT.from);
    expect(ledger.pending("0:first:2")).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a moment whose frames all fail the classifier is counted as an attempt, not a success", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SEGMENTS, ledger, {
      ...deps,
      screenOf: () => undefined,
    });
    expect(kept).toEqual([]);
    expect(ledger.pending("0:first:2")).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the scratch folder is not left behind", async () => {
  const { dir, deps } = await harness();
  try {
    await captureMoment(MOMENT, SEGMENTS, new Ledger(), deps);
    expect(await Bun.file(`${dir}/scratch/0-first-2/p0-0001.jpg`).exists()).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip is cut with the streams copied, and named after the show", async () => {
  const { dir, deps, ran } = await harness();
  const clip = { showIndex: 2, from: AT - 10_000, to: AT + 5_000 };
  const ledger = new Ledger();
  try {
    const out = await cutShowClip(clip, SEGMENTS, "show-03-slime-climb", ledger, {
      ffmpeg: deps.ffmpeg,
      segmentDir: deps.segmentDir,
      showsDir: `${dir}/shows`,
      run: deps.run,
    });
    expect(out).toBe(`${dir}/shows/show-03-slime-climb.mp4`);
    expect(ran[0]).toContain("copy");
    expect(await Bun.file(`${dir}/segments/clip-2.txt`).text()).toBe("file 'seg-00003.mkv'\n");
    expect(ledger.pending("2:clip")).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip the segments do not cover yet is left pending", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const out = await cutShowClip(
      { showIndex: 0, from: AT - 60_000, to: AT },
      SEGMENTS,
      "show-01-x",
      ledger,
      {
        ffmpeg: deps.ffmpeg,
        segmentDir: deps.segmentDir,
        showsDir: `${dir}/shows`,
        run: deps.run,
      },
    );
    expect(out).toBeUndefined();
    expect(ledger.pending("0:clip")).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
