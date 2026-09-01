# Screenshots in the admin

Entering a show means typing names the admin cannot know: who crossed first, who reached the
final, who won. The evidence is on screen for a few seconds and then gone. ShareX already
captures it; this puts those captures next to the fields they answer.

## What the admin gets

A sticky panel down the right of the admin page. Clicking a round row, the finalists block or
the winners block fills the panel with the screenshots taken during that moment, full width,
click one for full resolution. Two catch-all sections underneath hold everything that did not
land in a slot, so no capture is ever invisible.

Nothing is copied, nothing is committed, `data/` is untouched. The panel is a reading aid for
the person at the keyboard.

Reading the names out of the pixels is a separate spec. This one only has to put the right
picture in front of the right field.

## Where the screenshots come from

`src/screenshot-dir.ts`, the same shape as `src/log-path.ts` — an injected `Lookup` so the
search is testable, and a failure to read `/mnt/c/Users` is not fatal:

```
SHAREX_DIR  →  $USERPROFILE/Documents/ShareX/Screenshots  →  /mnt/c/Users/*/…same
```

Inside the root, only ShareX's month folder for the event is read — `2026-09` for an event
dated `2026-09-01`. Scanning the whole tree drags in every capture of every earlier month,
and the event never spans a month boundary.

A capture's time is its mtime. ShareX filenames carry no clock, and copying a file into the
folder would lose its mtime — a caveat for the README, not a case to handle.

## Matching a capture to a slot

`parseLog` stamps shows and rounds with `startedAt`; this spec adds `wonAt` from the
`VictoryScene::winnerPlayerId` line. All three are local clock times, `HH:MM:SS`, no date.

`placeShots(shots, shows, date)` turns them into absolute times: the stamps are already in log
order, so walking them and rolling the day over whenever the clock goes backwards is enough.
The base date is `event.date`.

**Assumption:** the log's first stamped line falls on `event.date`. Starting a log the day
before the event shifts every window by a day. The event is one evening, so this holds.

| Slot in the form | Window |
|-----------------------|--------------------------------------------------------|
| race round *i* first  | `rounds[i].startedAt` → `rounds[i+1].startedAt`         |
| finalists             | final round's `startedAt` → `wonAt`                     |
| winners               | `wonAt` → the next show's `startedAt`                   |

A capture inside a show but in none of its round windows is filed under the show. One outside
every show is unmatched. A round with no stamp gets no window, and its captures fall through
to the show.

The finalists shot is the one that can land wrong: pressing the key while the semi's results
are still up files it under the semi. That is what the show-level section is for.

## Serving the bytes

The dev server only — the Pages build never sees any of this.

| Route | |
|----------------------|--------------------------------------------------------------|
| `/api/state`         | gains `shots` (placed, paths relative to the root) and `shotDir` |
| `/api/shot?f=<rel>`  | the file, rejecting any path that escapes the root            |

Paths cross the wire relative to the root so a traversal has nothing to work with, and the
admin never learns where the folder is beyond the one line under the heading.

## Testing

| Unit | |
|------------------------|------------------------------------------------------|
| `parseLog`             | `wonAt` read, absent when the line is unstamped        |
| `findScreenshotDir`    | each fallback in turn, against a fake lookup          |
| `placeShots`           | each window, the day rollover, show-level, unmatched  |
| `shotsForSlot`         | the panel's filter, given a placed list               |

The panel itself is DOM wiring over those functions, like the rest of `site/admin.ts`.
