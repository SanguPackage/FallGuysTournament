export const CONFETTI_COLOURS = ["#ffd23f", "#35d6f0", "#ff4fa3", "#6ee787", "#7b4cff", "#ffffff"];

/**
 * mulberry32. The board repaints on every poll, so the scatter has to come out identical each
 * time — a fresh Math.random would make the glitter jump on the spot every fifteen seconds.
 */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each speck carries its own size, drift, fall and twinkle, so no two move alike. */
export function confettiHtml(count = 60): string {
  const next = random(0x5eed);
  const specks: string[] = [];

  for (let index = 0; index < count; index++) {
    const style = [
      `--x:${(next() * 100).toFixed(1)}%`,
      `--w:${3 + Math.round(next() * 4)}px`,
      `--c:${CONFETTI_COLOURS[Math.floor(next() * CONFETTI_COLOURS.length)]}`,
      `--sway:${(next() * 60 - 30).toFixed(1)}px`,
      `--d:${(4.5 + next() * 4).toFixed(2)}s`,
      `--f:${(0.9 + next() * 1.6).toFixed(2)}s`,
      // Spread over a stretch longer than the fall itself, so the air is never briefly empty.
      `--delay:${((index * 6.13) % 8.9).toFixed(3)}s`,
    ].join(";");
    specks.push(`<i style="${style}"></i>`);
  }

  return `<div class="confetti" aria-hidden="true">${specks.join("")}</div>`;
}
