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

## Open defects, in the order worth fixing

### 1. A qualified player is missed entirely

`fixtures/` has the board: 23 QUALIFIED, and the reader returns 22 names. **`Clwn7490` is never
read** — the rightmost card of the top row. Truth for that board, in board order:

```
TopHat282 hannahbanana0724 WiCKED-Xiii dxniel_f13 Clwn7490
SonicCHTR NatTheGnat_ ErnieAdams_ SnaggTMD PlotTwistxo IG_ARATHNIDOツ
RLewy19 captainspork1983 coldgin1974 Dash2dgam1ng Nalga_izquierda4 lemonlimecooler
Danjaneer Pigbro42 CloudyHeron8350 DrivingZebra1233 TurtleSavior90 mykyel972
```

First find out which half is wrong: does `qualifiedCards` return 22 or 23? If 23, the band for
that card reads empty and the geometry is the problem; if 22, the card itself is not detected.
A name silently absent is worse than a garbled one — it scores nobody and looks like a clean read.

### 2. The band bleeds into the card to its left

Every remaining miss is the same shape — junk prefixed from the neighbour:

| Read                  | Should be          |
|-----------------------|--------------------|
| `a Piehrnd`           | `Pigbro42`         |
| `La mvkval972`        | `mykyel972`        |
| `a Danian`            | `Danjaneer`        |
| `Pichrad`             | `Pigbro42`         |
| `3 rk198 5po captain` | `captainspork1983` |

`nameBand` (`src/ocr/grid.ts`) reaches `cellWidth * 2.2` to the left and stops at `floor`, the
right edge of the previous **qualified** card. When the neighbour is an eliminated (pink X) card
there is no floor, so the band runs across it and picks up whatever is there. The floor should
come from the previous cell, qualified or not.

### 3. Trailing digits get trimmed

`RASSHADOW69` reads as `RASSHADOW`. The badge beside it is `1`, so `badgeLeft`/`dropLevel` took
three characters where it should have taken one. Only visible on unmatched names — the roster
match hides it everywhere else, so it may be eating digits far more widely than it appears.

## How to measure

```bash
bun test src/ocr/fixtures.test.ts     # what identify() must answer per screen
bun run scripts/ocr-score.ts          # character error rate and match rate
```

`fixtures/` holds real screens sorted by eye, with `manifest.json` giving the expected answer:
which pill carries the trophy, who it names, and each board read by hand. Both 1920x1080 and
3840x2160 captures are in there deliberately — see the gotchas.

**Two fixture folders fail on purpose** (14 frames, all `auto-` cuts from the FOM event): 8 boards
the grid reader no longer detects after two commits tightened it, 5 gameplay frames `isWinner`
claims, and 1 toast lost to orange scenery in the trophy strip. They are recorded rather than
skipped. Do not "fix" them by loosening the classifier without checking the fixtures still pass.

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

- The eliminated-banner guard: it measured magenta, never matched a banner, and voided frames whose
  trophy was readable. Deleted.
- `isWinner` claiming toasts: `identify` now tells a round from a show's end by the QUALIFIED plate.
- 1080p-only geometry: the band, badge gap and margin are shares of the frame, and the OCR upscale
  targets a glyph height. This took one show from ~7 of 21 names to 17 of 17 registered players.
- Autofill filling from a capture taken before the round's first qualifier.
- Captures abandoned before their footage was written (`MAX_ATTEMPTS` spent on segments that had
  not closed). This is why the FOM event caught 1 first place in 22.
