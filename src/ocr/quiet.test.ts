import { expect, test } from "bun:test";

/**
 * Tesseract narrates on stderr from its own C++ layer, which no amount of care on this side of the
 * worker can catch. The only honest test is to read a capture in a process of its own and look at
 * what it printed.
 */
test(
  "reading a capture says nothing on stderr",
  async () => {
    const child = Bun.spawn(
      ["bun", "-e", 'import { readShot } from "./src/ocr/read"; await readShot(Bun.argv[1]!); process.exit(0);', "fixtures/race-first/FallGuys_client_game_EkwUNtGCAI.jpg"],
      { stderr: "pipe", stdout: "pipe" },
    );
    const stderr = await new Response(child.stderr).text();
    await child.exited;
    expect(stderr.trim()).toBe("");
  },
  60_000,
);
