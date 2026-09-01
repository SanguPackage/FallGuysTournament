import { afterAll, expect, test } from "bun:test";
import { closeReader, readShot } from "./read";
import { assign, cleanToken } from "./match";

afterAll(async () => {
  await closeReader();
});

test(
  "the winner screen names the winner",
  async () => {
    const read = await readShot("src/ocr/samples/winner.jpg");
    expect(read.screen).toBe("winner");
    expect(assign(read.tokens.map(cleanToken), ["Diego_9942"])[0]!.name).toBe("Diego_9942");
  },
  120_000,
);

test(
  "the toast names whoever holds the trophy",
  async () => {
    const read = await readShot("src/ocr/samples/toast.jpg");
    expect(read.screen).toBe("toast");
    expect(assign([cleanToken(read.tokens[0]!)], ["Serxav_9", "Chi-_-lli"])[0]!.name).toBe(
      "Serxav_9",
    );
  },
  120_000,
);

test(
  "the board gives one token per qualified card",
  async () => {
    const read = await readShot("src/ocr/samples/grid-5.jpg");
    expect(read.screen).toBe("grid");
    expect(read.tokens.length).toBe(5);
  },
  180_000,
);

test(
  "the lobby yields no screen and no names",
  async () => {
    const read = await readShot("src/ocr/samples/lobby.jpg");
    expect(read.screen).toBeUndefined();
    expect(read.tokens).toEqual([]);
  },
  120_000,
);
