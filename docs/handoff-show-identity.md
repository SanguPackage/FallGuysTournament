# Handoff — a show's identity is its position in the log, and that moves

Restart the game and the next show captures nothing. Fall Guys rotates `Player.log` on launch, the
parse starts again from show 0, and every ledger key belonging to the old show 0 now belongs to the
new one. `ledger.pending()` says the work is done, the sweep never offers it, and no frame is ever
pulled. Nothing is logged, because from the ledger's side nothing went wrong.

It happened twice on 2026-09-04, and the second time cost The Whirlygig's first finisher until the
ledger was deleted by hand. The event is Saturday 14:00–19:00 and a crash mid-tournament does this
silently, which is the whole reason to fix it rather than write down the workaround.

## What is observed

| Observation                                                            | Where                             |
|------------------------------------------------------------------------|-----------------------------------|
| A game relaunch at 17:53 made the new show index 0 again                 | `Player-prev.log` mtime, `parseLog` |
| Its round-1 first finisher (17:54:57) was never captured                 | `shows/show-2026-09-04T17h53-solos-1` has no `first-race-finisher` |
| `2026-09-04:0:first:0` was already `captured`, from the 17:06 show       | `.ocr-cache/captured.json`        |
| The footage was on disk the whole time                                   | segments covered 17:53:19–17:57:29 |
| Deleting the ledger and restarting recovered it                          | —                                 |

The key is built from the show's position in the log:

```ts
// src/capture/moments.ts:141
return `${moment.date}:${moment.showIndex}:${moment.kind}:${moment.roundIndex ?? "-"}`;
```

`clipKey` on the next line has the same shape and the same problem.

Note what sits right beside it and does not have the problem: `showsOnDisk` names a show's folder
`showFolder(firstRound, slugOf(...))` — the clock its first round loaded at. Two shows cannot start
in the same minute, so that name survives a rotation, which is why the frames that *were* captured
landed in sensibly named folders even while the ledger was confusing two different shows.

## The shape of a fix

Give a moment the same identity its folder already has — the show's first-round start — and key the
ledger off that instead of the index. `momentsIn` has it to hand: `times[showIndex]` is a `ShowTimes`
and `span.rounds.find((start) => start !== undefined)` is exactly what `showsOnDisk` uses. A show
whose first round has not loaded has no such stamp, but it also has no folder and its moments are
already skipped in `sweepCaptures`, so the two agree.

Both `momentKey` and `clipKey` need it. `Moment` and `ShowClip` need to carry it.

**Changing the key format invalidates every entry in an existing ledger.** On the first run after
the change, every moment still in the log is offered again and re-captured over the same filenames.
That is harmless but not free, so land this *before* Saturday rather than during it.

## Worth deciding, not assumed

- Whether the stamp in the key should be the show's first-round start, its `startedAt`, or the
  folder name itself. The folder name is already a string and already unique; reusing it would make
  the ledger readable by eye and tie the two identities together on purpose.
- Whether `date` is still worth having in the key once a per-show stamp is in it.
- Whether an old-format ledger should be migrated or simply dropped. Dropping is honest and costs
  one re-capture; migrating cannot be done correctly, because the old key does not say which show it
  meant.

## Not established — check before believing

After the 17:53 rotation the 17:06 show's folder held only its `first` frames, while `field` and
`finalists` for key `...:0:...` ended up under the 17:53 folder. That is *consistent* with those two
moments still being pending when the log rotated and then being captured against the new show — in
which case the frames are correctly Whirlygig's and nothing is misfiled. It is also consistent with
a real misfiling bug. It was not run down. Do not repeat either claim without checking.

## Ground rules

- Recording must not stop or gap. ffmpeg is a separate process and survives the server; a restart
  kills the orphan it left (`src/capture/orphans.ts`).
- No moment may be lost to make this tidier: the winner screen and the first-place toast cannot be
  re-shot.
- TDD, tests green, `bun run typecheck` clean.
- The working tree may hold the user's own uncommitted files. Stage deliberately.

## Where to start

- `src/capture/moments.ts` — `momentKey`, `clipKey`, `Moment`, `ShowClip`, `momentsIn`.
- `src/capture/layout.ts` — `showsOnDisk` and `showFolder`, the identity that already works.
- `scripts/serve.ts:395–420` — `sweepCaptures`, where keys and folders are looked up together.
- `src/capture/ledger.ts` — `captured`, `attempts` and `exhausted` are all keyed by these strings.

Reproducing it needs no game: parse a log with two shows, capture show 0's moments, then parse a log
holding only the second show and check that its moments are still offered.

## Already fixed, do not re-diagnose

- A capture pass decoded 315 4K JPEGs at ~427 ms each, three times over. The search now reads a
  1080-tall copy and pulls only the frames it keeps at full size, and a pass that read frames and
  matched none is not repeated (`bed6ff8`, `d3fc97d`). Miss 143.7 s → 32.0 s.
- Segments are cut every 10 s, not 30. A moment cannot be cut until the segment holding the end of
  its window closes, which was half a minute of dead wait (`bfa29dc`).
- The queue takes the latest moment first, so a live round does not wait behind an old one
  (`c7df5a3`).
- The roster follows the show being played rather than only show 0, for testing against public
  solos (`bc123d1`).
- `scripts/bench-capture.ts` measures the extract/pick loop against a saved recording. It needs a
  segment folder and its `Player.log` kept outside `CAPTURE_DIR`, which is emptied between runs.
