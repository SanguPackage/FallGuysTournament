import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { Ledger, MAX_ATTEMPTS } from "./ledger";
import { CLASSIFY_HEIGHT } from "./command";
import { captureMoment, cutShowClip } from "./pipeline";
import { momentKey, type Moment } from "./moments";

const AT = Date.parse("2026-09-05T20:01:40Z");
const STAMP = "2026-09-05T20h00";
const MOMENT: Moment = {
  kind: "first",
  showIndex: 0,
  stamp: STAMP,
  roundIndex: 2,
  roundNumber: 3,
  at: AT,
  from: AT - 500,
  to: AT + 10_000,
  fps: 30,
};

const RUN = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T20h00m00";
const SEGMENTS = [{ file: "seg-00003.mkv", dir: RUN, from: AT - 20_000, to: AT + 10_000 }];

const SHOW_DIR = "show-2026-09-05T20h00-solos-1";

async function harness() {
  const dir = await mkdtemp(`${tmpdir()}/capture-`);
  const ran: string[][] = [];
  const scratchDir = `${dir}/scratch`;
  return {
    dir,
    ran,
    deps: {
      ffmpeg: "ff",
      scratchDir,
      showsDir: `${dir}/shows`,
      // Stands in for ffmpeg, for both the pulls the pipeline makes: the scaled one the search
      // reads, and the full-size stills of what it kept. Two frames each, written where the argv's
      // output pattern says — a tmpdir path is not a WSL mount, so `toWindows` left it alone.
      run: async (argv: string[]) => {
        ran.push(argv);
        const pattern = argv.at(-1)!;
        await mkdir(dirname(pattern), { recursive: true });
        const what = pattern.includes("keep-") ? "full size" : "scaled";
        for (const n of [1, 2]) await writeFile(pattern.replace("%04d", `000${n}`), `${what} ${n}`);
        return { ok: true, stderr: "" };
      },
      frameOf: async () => ({ width: 2, height: 2, at: () => [0, 0, 0] as const }),
      screenOf: () => "toast" as const,
      now: () => AT,
    },
  };
}

// The board: a long window, at a rate that puts several frames in every segment behind it.
const BOARD: Moment = {
  kind: "finalists",
  showIndex: 0,
  stamp: STAMP,
  roundIndex: 0,
  roundNumber: 1,
  at: AT,
  from: AT + 1000,
  to: AT + 31_000,
  fps: 2,
};

/** Ten-second segments across the board's window, as the recorder cuts them. */
const TENS = [0, 10, 20, 30].map((offset) => ({
  file: `seg-0000${offset / 10}.mkv`,
  dir: RUN,
  from: AT + offset * 1000,
  to: AT + (offset + 10) * 1000,
}));

test("a moment nothing covers is left pending rather than half captured", async () => {
  const { dir, deps, ran } = await harness();
  const ledger = new Ledger();
  try {
    expect(await captureMoment(MOMENT, SHOW_DIR, [], ledger, deps)).toEqual([]);
    expect(ran).toEqual([]);
    expect(ledger.pending(`${STAMP}:first:2`)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("kept frames land in the show's own folder with the mtime of the instant they show", async () => {
  const { dir, deps, ran } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, ledger, deps);
    // One pull of the whole window, then one full-size pull of what it kept.
    expect(ran.length).toBe(2);
    expect(ran[0]![0]).toBe("ff");
    expect(kept).toEqual([
      "show-2026-09-05T20h00-solos-1/round-03-first-race-finisher-01.jpg",
      "show-2026-09-05T20h00-solos-1/round-03-first-race-finisher-02.jpg",
    ]);
    const info = await stat(`${dir}/shows/${kept[0]!}`);
    // Frame 1 of a 30fps pull that began at `from`.
    expect(Math.round(info.mtimeMs)).toBe(MOMENT.from);
    expect(ledger.pending(`${STAMP}:first:2`)).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a moment whose footage was read and held nothing is given up on rather than retried", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, ledger, {
      ...deps,
      screenOf: () => undefined,
    });
    expect(kept).toEqual([]);
    expect(ledger.pending(`${STAMP}:first:2`)).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a moment whose frames could not be read at all is retried, not given up on", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, ledger, {
      ...deps,
      frameOf: () => Promise.reject(new Error("half written")),
    });
    expect(kept).toEqual([]);
    expect(ledger.pending(`${STAMP}:first:2`)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a moment whose extraction produced no frames is retried, not given up on", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, ledger, {
      ...deps,
      run: async () => ({ ok: true, stderr: "" }),
    });
    expect(kept).toEqual([]);
    expect(ledger.pending(`${STAMP}:first:2`)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the scratch folder is not left behind", async () => {
  const { dir, deps } = await harness();
  try {
    await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, new Ledger(), deps);
    expect(await Bun.file(`${dir}/scratch/${STAMP}-first-2/p0-0001.jpg`).exists()).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a frame is pulled from the run folder its segment came from", async () => {
  const { dir, deps, ran } = await harness();
  try {
    await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, new Ledger(), deps);
    expect(ran[0]![ran[0]!.indexOf("-i") + 1]).toBe(
      "C:\\temp\\FallGuysCapture\\segments\\2026-09-05T20h00m00\\seg-00003.mkv",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip is cut with the streams copied, into the folder of the show it is", async () => {
  const { dir, deps, ran } = await harness();
  const clip = { showIndex: 2, stamp: STAMP, from: AT - 10_000, to: AT + 5_000 };
  const ledger = new Ledger();
  try {
    const cut = await cutShowClip(
      clip,
      "show-2026-09-05T20h00-slime-climb-1/2026-09-05-show-03-slime-climb",
      SEGMENTS,
      ledger,
      {
        ffmpeg: deps.ffmpeg,
        scratchDir: deps.scratchDir,
        showsDir: deps.showsDir,
        run: deps.run,
      },
    );
    expect(cut).toEqual({
      out: `${dir}/shows/show-2026-09-05T20h00-slime-climb-1/2026-09-05-show-03-slime-climb.mp4`,
      gapped: false,
    });
    expect(ran[0]).toContain("copy");
    expect(await Bun.file(`${dir}/scratch/clip-2.txt`).text()).toBe(
      "file 'C:\\temp\\FallGuysCapture\\segments\\2026-09-05T20h00m00\\seg-00003.mkv'\n",
    );
    expect(ledger.pending(`${STAMP}:clip`)).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip whose recording died inside it is cut anyway, and says so", async () => {
  const { dir, deps } = await harness();
  const later = "/mnt/c/temp/FallGuysCapture/segments/2026-09-05T20h01m00";
  const split = [
    { file: "seg-00003.mkv", dir: RUN, from: AT - 20_000, to: AT - 5_000 },
    { file: "seg-00000.mkv", dir: later, from: AT + 5_000, to: AT + 20_000 },
  ];
  try {
    const cut = await cutShowClip(
      { showIndex: 1, stamp: STAMP, from: AT - 15_000, to: AT + 15_000 },
      "show-2026-09-05T20h00-x-1/show-02-x",
      split,
      new Ledger(),
      {
        ffmpeg: deps.ffmpeg,
        scratchDir: deps.scratchDir,
        showsDir: deps.showsDir,
        run: deps.run,
      },
    );
    expect(cut?.gapped).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip the segments do not cover yet is left pending", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const cut = await cutShowClip(
      { showIndex: 0, stamp: STAMP, from: AT - 60_000, to: AT },
      "show-2026-09-05T20h00-x-1/show-01-x",
      SEGMENTS,
      ledger,
      {
        ffmpeg: deps.ffmpeg,
        scratchDir: deps.scratchDir,
        showsDir: deps.showsDir,
        run: deps.run,
      },
    );
    expect(cut).toBeUndefined();
    expect(ledger.pending(`${STAMP}:clip`)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/**
 * A board's window runs 30s past the stamp and a segment takes as long again to close, so a moment
 * spends its first sweeps waiting. Counting those as failures abandoned every capture before the
 * footage holding it had been written.
 */
test("waiting on a segment still being written costs no attempt", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  const board: Moment = { ...MOMENT, kind: "finalists", from: AT + 1000, to: AT + 30_000, fps: 2 };
  const key = momentKey(board);

  // The segment holding the board has not closed yet, and will not for another half minute.
  const writing = [{ file: "seg-00003.mkv", dir: RUN, from: AT - 20_000, to: AT + 10_000 }];
  const sweeping = { ...deps, now: () => AT + 20_000 };
  for (let sweep = 0; sweep < 10; sweep++) {
    expect(await captureMoment(board, SHOW_DIR, writing, ledger, sweeping)).toEqual([]);
  }
  expect(ledger.pending(key)).toBe(true);

  // Long past the window, whatever was going to be written has been. This is a real miss.
  const settled = { ...deps, now: () => AT + 30_000 + 200_000 };
  for (let sweep = 0; sweep < MAX_ATTEMPTS; sweep++) {
    await captureMoment(board, SHOW_DIR, writing, ledger, settled);
  }
  expect(ledger.pending(key)).toBe(false);

  await rm(dir, { recursive: true, force: true });
});

test("the search reads scaled frames while the frame kept is pulled at full size", async () => {
  const { dir, deps, ran } = await harness();
  const read: string[] = [];
  try {
    const kept = await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, new Ledger(), {
      ...deps,
      frameOf: async (path: string) => {
        read.push(path);
        return { width: 2, height: 2, at: () => [0, 0, 0] as const };
      },
    });
    expect(ran[0]).toContain(`fps=30,scale=-2:${CLASSIFY_HEIGHT}`);
    expect(read.length).toBe(2);
    expect(await Bun.file(`${dir}/shows/${kept[0]!}`).text()).toBe("full size 1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the frames kept are pulled at full size in one go, not one seek each", async () => {
  const { dir, deps, ran } = await harness();
  try {
    await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, new Ledger(), deps);
    // One scaled pull of the window, one full-size pull of the span the kept frames fall in.
    expect(ran.length).toBe(2);
    expect(ran[0]).toContain(`fps=30,scale=-2:${CLASSIFY_HEIGHT}`);
    expect(ran[1]).toContain("fps=30");
    expect(ran[1]).not.toContain(`fps=30,scale=-2:${CLASSIFY_HEIGHT}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a still that will not come out leaves the scaled frame rather than losing the moment", async () => {
  const { dir, deps } = await harness();
  try {
    const kept = await captureMoment(MOMENT, SHOW_DIR, SEGMENTS, new Ledger(), {
      ...deps,
      run: async (argv: string[]) =>
        argv.at(-1)!.includes("keep-")
          ? { ok: false, stderr: "no such frame" }
          : deps.run(argv),
    });
    expect(kept.length).toBe(2);
    expect(await Bun.file(`${dir}/shows/${kept[0]!}`).text()).toBe("scaled 1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a window the recording is still inside is searched once enough of it is on disk", async () => {
  const { dir, deps, ran } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(BOARD, SHOW_DIR, TENS.slice(0, 2), ledger, {
      ...deps,
      screenOf: () => "grid" as const,
    });
    // Fewer than the quota, and kept anyway: they are the frames the whole window would have
    // given first, and the round after this one is already being played.
    expect(kept).toEqual([
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-01.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-02.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-03.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-04.jpg",
    ]);
    // Only the segments that had closed: the window runs another ten seconds past them.
    expect(ran.filter((argv) => !argv.at(-1)!.includes("keep-")).length).toBe(2);
    expect(ledger.pending(`${STAMP}:finalists:0`)).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a short window holding nothing waits for the rest rather than being given up on", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  try {
    const kept = await captureMoment(BOARD, SHOW_DIR, TENS.slice(0, 2), ledger, {
      ...deps,
      screenOf: () => undefined,
    });
    expect(kept).toEqual([]);
    expect(ledger.pending(`${STAMP}:finalists:0`)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a window barely open yet is left alone rather than searched a frame at a time", async () => {
  const { dir, deps, ran } = await harness();
  try {
    const kept = await captureMoment(BOARD, SHOW_DIR, TENS.slice(0, 1), new Ledger(), deps);
    expect(kept).toEqual([]);
    expect(ran).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("segments past the one that filled the quota are never opened", async () => {
  const { dir, deps, ran } = await harness();
  try {
    const kept = await captureMoment(BOARD, SHOW_DIR, TENS, new Ledger(), {
      ...deps,
      screenOf: () => "grid" as const,
    });
    // Two frames a segment, so the fifth keeps the search inside the third.
    expect(kept.length).toBe(5);
    expect(ran.filter((argv) => !argv.at(-1)!.includes("keep-")).length).toBe(3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a moment filed under two kinds pulls the footage once and names both", async () => {
  const { dir, deps, ran } = await harness();
  const ledger = new Ledger();
  const board = { ...BOARD, kind: "field" as const, also: ["finalists" as const] };
  let read = 0;
  try {
    const kept = await captureMoment(board, SHOW_DIR, TENS, ledger, {
      ...deps,
      // The board as it plays: REMAIN for the first few frames, QUALIFIED once it settles.
      screenOf: () => (++read <= 2 ? ("field" as const) : ("grid" as const)),
    });
    expect(kept).toEqual([
      "show-2026-09-05T20h00-solos-1/round-01-whole-field-01.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-whole-field-02.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-01.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-02.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-03.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-04.jpg",
      "show-2026-09-05T20h00-solos-1/round-01-finalists-board-05.jpg",
    ]);
    // One full-size pull per segment the seven frames fell across, not one set of pulls per kind.
    expect(ran.filter((argv) => argv.at(-1)!.includes("keep-")).length).toBe(4);
    expect(ledger.pending(`${STAMP}:field:0`)).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a short window that has only found one of a moment's two screens waits for the rest", async () => {
  const { dir, deps } = await harness();
  const ledger = new Ledger();
  const board = { ...BOARD, kind: "field" as const, also: ["finalists" as const] };
  try {
    const kept = await captureMoment(board, SHOW_DIR, TENS.slice(0, 2), ledger, {
      ...deps,
      screenOf: () => "field" as const,
    });
    expect(kept).toEqual([]);
    expect(ledger.pending(`${STAMP}:field:0`)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
