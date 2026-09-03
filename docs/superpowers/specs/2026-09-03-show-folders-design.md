# Captures grouped by show

Everything a show produced — its video, its transcript, its frames — lands in one folder named
after the show. Today the three are spread across `shows/*.mp4`, `captures/YYYY-MM/*.jpg` and a
single evening transcript, and the frames are named `auto-4-first-232557-1.jpg`: readable only
against the log.

## Layout

```
CAPTURE_DIR/
  2026-09-02.transcript.txt          the evening, everything, as now
  segments/2026-09-02T21h58m45/      unchanged
  scratch/                           unchanged
  shows/
    show-2026-09-02T23h25-solos-4/
      2026-09-02-show-04-solos-4.mp4
      transcript.txt                 this show's lines only
      round-01-whole-field-01.jpg
      round-01-first-race-finisher-01.jpg
      round-03-finalists-board-01.jpg
      round-04-winner-01.jpg
```

Show folders are flat under `shows/`: an evening runs past midnight, so a day folder would split
one evening in two.

`captures/` is retired — neither written nor read. What is in it stays on disk; nothing migrates.
The evening transcript moves from `captures/YYYY-MM/<date>.transcript.txt` to the capture root.

### Names

Show folder: `show-<start>-<slug>`, where `<start>` is `YYYY-MM-DDTHHhMM` local of the show's first
round — the same instant the clip is cut from — and `<slug>` is `suggestShowName` lowercased and
hyphenated. Both are known from the log the moment the show's first round loads, so the folder is
never renamed.

Capture: `round-<NN>-<kind>-<NN>.jpg`. Rounds are numbered from 1, as the admin and the board show
them. The trailing number is the frame's rank among the few kept for that moment.

| Moment kind | In a file name        |
|-------------|-----------------------|
| `first`     | `first-race-finisher` |
| `finalists` | `finalists-board`     |
| `field`     | `whole-field`         |
| `winner`    | `winner`              |

The winner screen belongs to the show rather than a round, and is filed under the final's number,
so everything in the folder has one shape.

Video: the clip keeps the name it has today, `<date>-show-<NN>-<slug>.mp4`, so it still says what
it is once dragged out of the folder.

## Components

### `src/capture/layout.ts` (new)

The only module that knows the layout. Pure.

| Function                          | Returns                                                                 |
|-----------------------------------|-------------------------------------------------------------------------|
| `showsOnDisk(shows, date)`        | per show `{ showIndex, dir, from, to }` — folder name and the time window its transcript covers |
| `captureFile(kind, round, index)` | `round-01-first-race-finisher-01.jpg`                                   |
| `clipFile(date, showIndex, slug)` | `2026-09-02-show-04-solos-4`, moved out of `scripts/serve.ts`           |
| `showDirsFor(names, date)`        | the folders belonging to one evening: stamped `date` or the day after   |

`from` is the show's own start, not its first round's, so the lines that announce the show are in
its transcript; `to` is the next show's start, or open-ended for the one still being played.

`showsOnDisk` is the single source of truth for which folder a show owns and which window it spans;
naming, transcript slicing and the folder filter all read it, so they cannot disagree.

A show with no round started yet has no folder — there is nothing to name it after and nothing to
put in it.

### `src/capture/moments.ts`

`Moment` gains `roundNumber: number`, 1-based, which for a winner is the final's. `momentKey` does
not change, so a ledger written before this still reads as captured and nothing is pulled twice.

### `src/capture/pipeline.ts`

`captureMoment`'s deps lose `captureDir` and gain `showsDir` plus the show's folder name. Frames are
written to `<showsDir>/<showDir>/<captureFile(...)>` and returned relative to `showsDir`, which is
the root the admin serves them from. The `YYYY-MM` and `HHMMSS` helpers go: the folder carries the
day and the name carries the position.

`cutShowClip` writes into the same folder instead of `shows/` directly.

Both keep filing frames under the mtime of the instant they show — that is what places them.

### `src/transcript/slice.ts` (new)

`linesBetween(entries, from, to)` — the lines of one show. Pure.

### `src/transcript/transcript.ts`

`transcriptPath` returns `<captureDir>/<date>.transcript.txt`. `Transcript` gains an optional tap
called for every line written, which is how the evening's entries are kept.

### `scripts/serve.ts`

- Holds the evening's `Entry[]`, filled by the tap.
- Each sweep, for every show in `showsOnDisk`, rewrites `<showDir>/transcript.txt` from
  `linesBetween` when the slice has grown since the last write.
- Passes the show's folder into `captureMoment` and `cutShowClip`.
- `rootFor("auto")` returns `folders.shows`.

Rewriting rather than appending is what lets a line that lands late — an OCR fill, an admin edit —
still reach the show it belongs to.

### `src/shot-folder.ts`

`listShots` is unchanged; ShareX still files by month. `listShowShots(showsRoot, date)` walks the
folders `showDirsFor` picked and returns the images in them as `auto` shots, `file` relative to
`showsRoot`. `resolveShot` already accepts any relative path under a root, so serving them needs no
change.

### `src/capture/paths.ts`

`captureFolders` drops `captures`.

## Placement

`placeShots` does not change. An auto capture is placed by its mtime against the log, exactly as a
ShareX one is, and the round in its name is not consulted. The name is for a human browsing the
folder; in the rare case the two disagree, the admin's placement is the one that decides what is
shown where.

## Trade-offs accepted

- **A restart mid-evening loses two lanes from earlier shows' `transcript.txt`.** The buffer starts
  empty, but the reporter replays the log, the placed captures and the cached reads on the first
  poll, so those shows are rebuilt. `admin` notes and `queue` lines cannot be replayed and survive
  only in the evening file, which is append-only and stays complete.
- **An earlier evening cannot be browsed in the admin.** `showDirsFor` keeps two days, so older
  folders are not listed at all. The files are still on disk.
- **Nothing migrates.** Tonight's `captures/` and `shows/*.mp4` stay in the old shape and drop out
  of the admin.

## Testing

Unit tests, TDD, alongside each module:

- `layout.test.ts` — folder name across midnight, slug hyphenation, every kind, winner numbering,
  round numbering from 1, `showDirsFor` keeping the day after and dropping the day before, a show
  with no round yet.
- `slice.test.ts` — a line on each boundary, a line before the first show, an open-ended last show.
- `moments.test.ts` — `roundNumber` for each kind; `momentKey` unchanged.
- `pipeline.test.ts` — frames land in the show folder under the new names and are returned relative
  to `showsDir`.
- `shot-folder.test.ts` — `listShowShots` returns only the evening's folders, images only.
