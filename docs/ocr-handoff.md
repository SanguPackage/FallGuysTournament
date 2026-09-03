# Handoff — reading names off the boards

Continue work on the OCR behind the admin's autofill. Everything below was established on
2026-09-02/03 against two real Solos shows.

## What the feature is

`src/ocr/` reads three screens off captures and fills the admin's blank fields:

| Screen              | Fills                 | Read from                      |
|---------------------|-----------------------|--------------------------------|
| Qualification board | `rounds[n].qualified` | the name over every green card |
| Winner screen       | `winners`             | the nameplate under the bean   |
| Qualified toast     | `rounds[n].first`     | the pill wearing the trophy    |

Names are matched against `ingame` in `data/players.json`. Everyone is registered, so the roster
is the answer key, not a spelling aid. A name no roster entry claims is filled in but marked red.

## Where the reader stands

Every name written in the Latin alphabet on the three boards `fixtures/manifest.json` holds an
answer for now reads and matches: 48 of 48, `src/ocr/board.test.ts`. Across the six boards with a
truth to check against it is 52 of 56, the four misses all Greek.

The toasts are 8 of 10, `src/ocr/toast-read.test.ts`. The two left are both `mil00000h`.

## Open defects, in the order worth fixing

### 1. A name not written in the Latin alphabet is never read

`ΥΨΗΛΑΝΤΗΣ ΠΙΠΑΣ` reads as `YYHAANTHI MAI`: Tesseract carries the English model only, so it spells
Greek in whatever Latin letters the shapes resemble. The matcher then has nothing to work with, and
these are the only names on the boards it cannot place. Loading `ell` alongside `eng` is the
obvious move; the reader picks one language at `createWorker` in `src/ocr/read.ts`.

### 2. `mil00000h` is never read off its pill

Five zeros between an `l` and an `h`, on the two captures that hold it: one has the pill over flat
green with the lozenge all but invisible, the other over the eliminated banner's white lettering.
Both are listed in `UNREAD` in `src/ocr/toast-read.test.ts` and skipped there. No cutoff between
190 and 250 gives them up, so this needs the lozenge found rather than assumed — its edges are
what would tell the name from the level behind it.

### 3. Fourteen fixture frames fail on purpose

All `auto-` cuts from the FOM event: 8 boards the grid reader no longer detects after two commits
tightened it, 5 gameplay frames `isWinner` claims, and 1 toast lost to orange scenery in the trophy
strip. They are recorded rather than skipped. Do not "fix" them by loosening the classifier without
checking the fixtures still pass.

## How to measure

```bash
bun test src/ocr/                     # board reads, geometry, and what identify() must answer
bun run scripts/ocr-score.ts          # character error rate and match rate
```

`fixtures/` holds real screens sorted by eye, with `manifest.json` giving the expected answer:
which pill carries the trophy, who it names, and each board read by hand. Both 1920x1080 and
3840x2160 captures are in there deliberately — see the gotchas.

## Gotchas that cost hours

- **Restart the server after changing anything server-side.** `/admin.js` is rebuilt from source on
  every request, so UI changes appear instantly while `scripts/serve.ts` keeps running the old
  code. This looks exactly like "the fix did nothing".
- **The read cache survives code changes.** `.ocr-cache/reads.json` is keyed by filename and mtime,
  neither of which a reader change moves. Use the show's **Re-read captures** button, or delete the
  file. Adding a reader version to the cache key is an open suggestion and would remove this trap.
- **Only the server may run Tesseract.** A standalone script asking for a worker while the server
  holds one hangs indefinitely with no error. Stop the server first, or go through the endpoint.
- **`CAPTURE_DIR` currently defaults to `/mnt/c/temp/FallGuysCapture`.** It has moved twice. Read
  `src/capture/paths.ts` rather than assuming.
- **Never write test files into the ShareX folder.** They are picked up as captures and placed into
  rounds by mtime.

## Already fixed — do not redo

- The toast pill's name box and its cutoff. The box was the slice `hasPill` measures, which is far
  narrower than the lozenge — the lozenge is right-anchored under the trophy and grows leftwards
  with the name, so a long one was clipped at both ends. And the pill's white text sits on a
  translucent lozenge, so a level pale enough behind it takes the whole strip over one cutoff and
  the mask comes out a solid block that reads as nothing. `nameBox` is now the wider box, and both
  a low and a high cutoff are read with the fuller answer kept. Took the toasts from 4 of 10 to 8.
- The board's row geometry: a row is 145 tall and the top one starts at 235, not 144 and 225.
  Nothing on the top row noticed the difference and every row below it did — by the bottom row the
  name band had slid up onto the card's controller icon, which Tesseract read as a leading
  character of its own (`Pigbro42` as `a Piehrnd`), and off the descenders of `g`, `j` and `y`.
- The level badge scan: it looked for gold, and the open sky to the right of the board is gold, so
  on the last column it found a "badge" a third of the way across the card and cut the band to
  28 pixels, which reads as nothing at all. It is gone. The nameplate — name, then badge — is
  centred over its own card and never leaves it, so the band is simply the card's own column, and
  `dropLevel` takes the badge's number off the end. `RASSHADOW69` keeps its digits again.
- A band is read as one line. Left to work it out, Tesseract broke a short name into blocks and
  returned them out of order: `spibblej 21` as `1 lej 2 spibb`.
- The eliminated-banner guard: it measured magenta, never matched a banner, and voided frames whose
  trophy was readable. Deleted.
- `isWinner` claiming toasts: `identify` now tells a round from a show's end by the QUALIFIED plate.
- 1080p-only geometry: the band and its margin are shares of the frame, and the OCR upscale
  targets a glyph height. This took one show from ~7 of 21 names to 17 of 17 registered players.
- Autofill filling from a capture taken before the round's first qualifier.
- Captures abandoned before their footage was written (`MAX_ATTEMPTS` spent on segments that had
  not closed). This is why the FOM event caught 1 first place in 22.
