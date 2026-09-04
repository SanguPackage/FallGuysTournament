# Deleting a show

## Problem

A misfire — a show recorded against the wrong log entry, or ticked in by accident — has no way out
of the leaderboard. The admin can edit a show but not remove it.

## Rule

Only the last entered show can be deleted: `showIndex === event.shows.length - 1`.

`event.shows[i]` is paired by index with the log's parsed show `i` — the admin rows, the autofill
slots, `/api/reread` and the capture folders all read that pairing. Splicing a middle show out
would re-point every later show at the wrong log entry. Popping the last one cannot.

Earlier rows render the button disabled, with a title saying why, rather than hiding it: a button
that is missing on some rows reads as a bug.

## Server owns the operation

The browser cannot write to the capture folder, and archive-then-pop-then-save must not half
happen, so it is one endpoint rather than an archive call followed by a `PUT /api/event`.

`POST /api/delete-show { showIndex }`

1. Load `event.json`. Reject with 409 unless `showIndex` is the last index — this is what a stale
   browser hits, and it must not delete the wrong show.
2. Resolve the folder: `showsOnDisk(parsed, date).find(f => f.showIndex === showIndex)`, then
   `mkdir -p`. A show whose first round never loaded has no folder name; it archives to
   `shows/deleted-show-<date>-<n>.json` instead. A delete that refuses on the night is worse than
   an oddly named archive.
3. Write `archivedShow(...)` under `archiveName(...)`.
4. `event.shows.pop()`, save, and publish `data: delete show N — <name>` when `AUTO_PUBLISH`.
5. Write a transcript line and return the path written.

## Archive

Beside the show's own captures, so the JSON is found by whoever goes looking at the footage:

```
shows/show-2026-09-04T20h15-solos-2/
  round-01-first-race-finisher-01.jpg
  deleted-show.json
```

Numbered on collision (`deleted-show-02.json`, `-03`, …): a show can be re-entered, misfire again
and be deleted again, and the first archive is as worth keeping as the second.

Body carries the slot it came from, since the show's own name need not say which:

```json
{
  "deletedAt": "2026-09-04T21:03:11.000Z",
  "showIndex": 1,
  "show": { "name": "Solos 2", "rounds": [], "winners": [] }
}
```

Restoring is pasting `show` back into `event.json`. No restore UI.

## Client

`×` beside `Edit`, styled `danger`. `confirm()` names the show and says the data is saved beside
that show's captures — it does not spell the path, so folder naming stays server-side. The status
line afterwards reports the path actually written.

On success: drop `drafts.get(index)`, clear `editing` if it was that row, reload state.

## Units

| Unit                                 | Where                    | Tested |
| ------------------------------------ | ------------------------ | ------ |
| `archiveName(existing: string[])`    | `src/capture/archive.ts` | yes    |
| `archivedShow(show, index, at)`      | `src/capture/archive.ts` | yes    |
| `canDeleteShow(event, index)`        | `site/admin-model.ts`    | yes    |
| endpoint wiring, mkdir/readdir/write | `scripts/serve.ts`       | no — composition root, as the rest of it is |
