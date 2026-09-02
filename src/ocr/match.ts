/** Glyphs Tesseract trades for one another at this size. */
const CONFUSABLE: Record<string, string> = {
  "0": "o",
  "1": "l",
  "5": "s",
  "8": "b",
  "6": "g",
  "2": "z",
};

const ACCEPT = 0.45;
/** How far clear the winner must be. Below this the two candidates are the same read. */
const MARGIN = 0.08;

export interface Assignment {
  token: string;
  /** The roster name, when one won clearly. */
  name?: string;
  /** What to put in the field: the roster name, or the token as read. */
  value: string;
}

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .split("")
    .map((c) => CONFUSABLE[c] ?? c)
    .join("");
}

/**
 * Strips the stray glyphs OCR reads around a name. Hyphens survive inside one — `Chi-_-lli` is a
 * real name — but a leading or trailing one is the platform icon smeared into a character.
 */
export function cleanToken(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9_\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-\s]+|[-\s]+$/g, "");
}

/**
 * Drops the crown's level number. Only the board wears a crown — a toast pill has none, so its
 * trailing digits are part of the name, as in `Serxav_9`.
 */
export function dropLevel(token: string): string {
  return token.replace(/\s+\d{1,3}$/, "").trim();
}

function distance(a: string, b: string): number {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return 1;
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      current.push(
        Math.min(
          previous[j]! + 1,
          current[j - 1]! + 1,
          previous[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[y.length]! / Math.max(x.length, y.length);
}

/**
 * One roster name per token, best pairing first. Every player is registered, so the roster is the
 * answer key rather than a spelling aid — but only once the text is split per name, or two
 * near-identical entries both match the same blurry token. A name already taken is not offered
 * again, nobody qualifies twice, and a token whose winner does not beat the runner-up is left as
 * read rather than guessed at.
 */
export function assign(tokens: string[], roster: string[]): Assignment[] {
  const ranked = tokens.map((token) =>
    roster.map((name) => ({ name, d: distance(token, name) })).sort((a, b) => a.d - b.d),
  );

  const pairs = ranked
    .flatMap((candidates, index) => {
      const best = candidates[0];
      const runnerUp = candidates[1];
      if (!best || best.d > ACCEPT) return [];
      if (runnerUp !== undefined && runnerUp.d - best.d < MARGIN) return [];
      return [{ index, name: best.name, d: best.d }];
    })
    .sort((a, b) => a.d - b.d);

  const taken = new Set<string>();
  const won = new Map<number, string>();
  for (const pair of pairs) {
    if (taken.has(pair.name) || won.has(pair.index)) continue;
    taken.add(pair.name);
    won.set(pair.index, pair.name);
  }

  return tokens.map((token, index) => {
    const name = won.get(index);
    return name === undefined ? { token, value: token } : { token, name, value: name };
  });
}
