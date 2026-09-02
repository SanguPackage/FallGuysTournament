# Recordings that never overwrite each other

Design, 2026-09-02.

The recorder writes `seg-%05d.mkv` and `segments.csv` into one flat folder, with `-y`. Segment
numbering restarts at `00000` on every ffmpeg spawn, so a second spawn walks over the first.

That is not only a restart. `Recorder.loop` respawns ffmpeg after a crash, into the same folder.
A crash forty minutes into an event silently destroys everything recorded so far, and the admin
gives no sign of it: the console still reads `Recording on`.

## What overwrites what, today

| Path                                   | Mechanism                           | Overwritten when                                    |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `segments/seg-%05d.mkv`                | `-y`, numbering restarts at `00000` | every server start **and** every crash-respawn      |
| `segments/segments.csv`                | `-segment_list` truncates           | same                                                |
| `shows/show-NN-slug.mp4`               | `-y`, no date in the name           | a later event reaching the same number and name     |
| `captures/YYYY-MM/auto-…-HHMMSS-N.jpg` | `Bun.write`                         | two events at the same UTC second — not in practice |
| `scratch/<key>`                        | `rm -rf` on the way in and out      | by design                                           |

`shows/` survives today only by accident: the ledger keys are `showIndex:kind:round` with no date,
so on a later event `0:clip` reads as already done and the clip is never cut. The same accident
means a later event captures nothing at all for its first show.

## Shape

```
capture/
  segments/
    2026-09-02T21h41m03/      server start
      seg-00000.mkv …
      segments.csv
    2026-09-02T22h07m44/      ffmpeg died, respawned
      seg-00000.mkv …
      segments.csv
  shows/
    2026-09-02-show-01-slime-climb.mp4
  captures/2026-09/auto-1-winner-211203-1.jpg
```

One folder per ffmpeg spawn, not per show. The show name does not exist when recording starts —
nothing is playing yet — and rotating at show boundaries would kill ffmpeg exactly where the clip
window needs footage: `CLIP_HEAD` reaches 5s before round one and `CLIP_TAIL` 15s past the end.
The show name belongs on the clip, which already knows it.

Seconds are in the stamp because a respawn can happen inside the same minute. At minute
granularity a crash-loop would collide with itself, which is the thing being fixed.

## Runs

`Recorder` gains an option `newRun: () => string`, returning a fresh run folder, and `argvFor`
takes that folder: `argvFor(audio, runDir)`. Each spawn appends `{ dir, startedAt }` to a list
exposed as `runs()`. `startedAt()` keeps its present meaning — the current run.

`newRun()` lives in `serve.ts`, which is where the filesystem already is. It creates the folder,
and removes the previous one if it holds no `.mkv`. Without that, an input that will not open
leaves a folder behind every ten seconds for as long as the server runs.

`segmentsNow()` maps `runs()`, reads each `segments.csv`, and parses it against that run's own
start. A run whose CSV is missing or empty contributes nothing.

## Reading across a split

`Segment` gains `dir`, the run folder holding it, and `file` stays relative to it. `parseSegments`
takes the folder alongside the start time.

`Coverage` gains `gapped`. Inside a run, consecutive CSV rows are contiguous by construction — one
row's end is the next row's start. Across a run boundary there is a hole: the final segment of the
dead run was never closed, so up to 30s is lost, plus however long the respawn took. More than one
second between parts is a gap.

| Consumer        | Behaviour on a gap                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captureMoment` | Ignores it. Each part is extracted on its own and every frame is timestamped from its own `part.from`, so a hole only means fewer candidates.               |
| `cutShowClip`   | Cuts anyway, and logs it. Refusing spends the ledger's three attempts and abandons a show whose footage is on disk. A clip with a jump in it beats no clip. |

`concatList` emits absolute Windows paths, because parts can now span folders; `-safe 0` is
already passed. The list file moves from the segment folder to scratch. `segmentDir` leaves
`CaptureDeps` and `ClipDeps` — every part carries its own.

## Dates

`momentsIn` and `showClips` already take the event date. They stamp it onto `Moment` and
`ShowClip`, so `momentKey` and `clipKey` stay single-argument and yield `2026-09-02:0:clip`.
Yesterday's entries stay in the ledger, inert, and a restart mid-event still resumes exactly where
it left off.

`clipName` becomes `${event.date}-show-NN-slug`.

## Unchanged

`captures/YYYY-MM/` keeps its layout. The names carry clock seconds and are already effectively
collision-free, and `listShots` and `placeShots` read that shape.

## Testing

Every piece is a pure function with a test file already beside it.

| File               | What it must show                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `paths.test.ts`    | The run stamp is `YYYY-MM-DDTHHhMMmSS`, and two spawns a second apart differ                             |
| `recorder.test.ts` | A spawn asks `newRun` for a folder; `runs()` lists every spawn with its start                            |
| `segments.test.ts` | `parseSegments` carries the folder; `coverage` reports `gapped` across a run boundary and not within one |
| `command.test.ts`  | `concatList` emits absolute Windows paths                                                                |
| `moments.test.ts`  | Keys carry the event date                                                                                |
| `pipeline.test.ts` | A moment and a clip whose parts come from two folders                                                    |
