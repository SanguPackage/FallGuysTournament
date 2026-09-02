# Naming the captures after what they show

Design, 2026-09-02.

A capture is currently named by whatever took it: `2026-09-01_22-14-03.png` from ShareX,
`auto-1-winner-221403-1.jpg` from the frame extractor. Neither says which show, which round or who
is on screen. The admin already knows all three — `placeShots` files every capture under a show and
a round, `identify` says which screen it is, and `event.json` holds the names once they are typed.

So once a show has been read back and is correct, its captures are renamed to say what they are:

```
FG-01-Solos-04-ThinIce-Winner-OptinuxPrime-221403.png
```

Nothing downstream depends on a capture's name. Placement is by **mtime**, which a rename leaves
alone, so a renamed capture still lands in the same round.

## When

A `Rename captures` button in the screenshot panel, acting on the show being edited. The names come
out of `event.json`, so renaming after the show is ticked off means the filenames carry the
corrected names rather than the first OCR guess.

Not automatic: names written from provisional data would be rewritten on every correction.

## The name

Segments joined by `-`, original extension kept.

| Part      | Source                                                      | Example               |
|-----------|-------------------------------------------------------------|-----------------------|
| prefix    | literal                                                     | `FG`                  |
| show nr   | `showIndex + 1`, padded to 2                                | `01`                  |
| show name | `event.shows[i].name`                                       | `Solos`               |
| round nr  | `roundIndex + 1`, padded to 2                               | `04`                  |
| round map | `event.shows[i].rounds[r].map`, else the log's round name    | `ThinIce`             |
| tail      | which screen it is, plus the name where there is one        | `Winner-OptinuxPrime` |
| time      | `HHmmss` of `takenAt` in `Europe/Brussels`                  | `221403`              |

The tail comes from the screen `identify` found:

| Screen                       | Tail                                      |
|------------------------------|-------------------------------------------|
| `toast`                      | `Qualified-<round.first>`, or `Qualified`  |
| `winner`                     | `Winner-<winners joined by ->`, or `Winner` |
| `grid` with `namesFinalists` | `Finalists`                               |
| `grid` otherwise             | `Board`                                   |
| unread or unidentified       | `Screen`                                  |

The board comes up after every round, so only the one following the round before the final names
the finalists — the same distinction the capture panel draws.

Names are taken from `event.json` rather than from the OCR read, so a field typed over by hand is
what reaches the filename.

A show not yet recorded in `event.json` has no names to draw on. Its captures still rename — show
name and round map fall back to what the log parsed, and every tail is the bare screen kind. Typing
the show in and clicking again fills the names.

Segments keep `[A-Za-z0-9_]` and drop everything else: `Hex-A-Gone` becomes `HexAGone`, `Day at the
Races Solo` becomes `DayAtTheRacesSolo`. A dash inside a name would otherwise read as a segment
break.

The finalists board and the winner screen sit after the final has been played, and carry the
final's round number. A capture between rounds has no round at all:

```
FG-01-Solos-Between-Screen-221403.png
```

A capture matching no show is left alone.

## Both roots

ShareX captures and extracted frames are renamed the same way. Each file stays in its own root and
its own `YYYY-MM` folder; only the basename changes. `Shot.source` says which root to resolve
against.

This makes the admin write to the ShareX folder, which it has never done. The README says so today
and is corrected as part of this.

## Collisions

Two captures of the same show in the same second get `-2`, `-3` after the time, in capture order;
the first is unsuffixed.

The plan is rebuilt from scratch on every run, so a file already named `FG-...` is renamed again
rather than added to. Correcting a name and clicking again yields the right name.

Before anything moves, every target is checked unique within the plan and free on disk outside it.
Any conflict left over aborts the whole plan, names the pair, and moves nothing.

The rename runs in two passes — every source to a temp name, then every temp to its target. Two
captures swapping names after a correction is a cycle, and a single pass would clobber one of them.

## Shape

```
src/shot-names.ts   renamePlan(shots, reads, event, shows, showIndex) → { source, from, to }[]
                    pure: no fs, no dates beyond takenAt

scripts/serve.ts    POST /api/rename { showIndex }
                      rebuild the state /api/state already assembles
                      → renamePlan
                      → two-pass rename through the per-source roots
                      → migrate the OCR cache keys
                      → { renamed, skipped }

site/admin.ts       "Rename captures" button in the #shots header, on selectedShow
                      → POST → refetch state
```

No confirmation step: mtime is untouched, so nothing is lost that placement or the panel depends
on, and the overwrite checks are what make it safe.

### The OCR cache

Reads are cached under `file@mtime`. A rename changes the file half of every key, and re-reading a
show's captures costs seconds per image. So the rename rewrites the keys it moved — same read, same
mtime, new name — and nothing is read twice.

`.ocr-cache/captured.json`, the extractor's ledger, keys on the moment rather than the filename, so
a renamed frame is not re-extracted.

## Time zone

`HHmmss` is rendered in `Europe/Brussels` through `Intl.DateTimeFormat`, matching the clock the
admin puts on every capture.

`clockOf` in `src/capture/pipeline.ts` stamps `auto-*` names in UTC, so those names are currently
two hours off what the panel shows beside them. Out of scope here; renaming replaces those names
with Brussels ones anyway.

## Tests

`src/shot-names.test.ts`, against hand-built `PlacedShot`s and a small `event.json`:

- numbering: show and round both from 1, padded
- each tail rule, including a blank `first` and several winners
- the finalists board and the winner screen carrying the final's round number
- a between-rounds capture, and an unmatched one left out of the plan
- two captures in the same second suffixed `-2`
- a re-run over already-renamed files producing the same plan
- two captures swapping names, applied without loss
- a conflict aborting the plan whole

Applying the plan is tested against a temp directory: two passes, cache keys migrated, and a
pre-existing file at a target refusing the run.
