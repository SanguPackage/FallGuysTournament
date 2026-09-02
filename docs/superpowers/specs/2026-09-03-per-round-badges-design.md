# Who went out on which round

The results page gives every show one field of coloured beans under its round list. That answers
"who is still in" but not "who died where" — the thing people argue about between shows. This
moves the beans up into the rounds: each round row carries the badges of the players it knocked
out.

It also folds the show being played into the same render path as every other show, which is what
makes the live box show a race winner at all.

## Two render paths, one of them blind

`site/results.ts` has two ways to draw a show.

| Path            | Used when                     | Knows                                     |
|-----------------|-------------------------------|-------------------------------------------|
| `renderShow`    | the show is in `event.json`   | maps, types, `first`, `qualified` names   |
| `renderPlaying` | `now.showNumber > shows.length` | maps, types, survivor **counts** only   |

`renderPlaying` draws from `LiveNow`, which the Fall Guys log fills. The log never learns a name —
it counts players through a round against playerIDs that are reassigned every show. So the live
box shows `on screen` / `—` in the winner column and a whole roster of grey beans, and it keeps
doing that after the admin has typed round 1's first-crosser in.

The two paths are also mutually blind in the other direction: once a show is partially saved,
`unrecorded` is false and `renderShow` ignores `now` entirely, so a round the log has already
loaded does not appear until somebody types it.

## Merge instead of branch

`renderPlaying` goes away. The show being played is built by merging the log onto whatever has
been recorded for it, then rendered by `renderShow` like everything else.

```ts
mergeLive(show: Show | undefined, now: LiveNow): Show
```

- Rounds `0..n-1` come from `event.json` — they carry `first`, `qualified`, `survivors`.
- Rounds past what is recorded are appended from `now.rounds`: `map` and `type` from the log,
  `survivors` from the length of the log's qualified list where it has one.
- A recorded round with no `survivors` takes the log's count for that index.
- `name` is the recorded name where there is one, else `now.show` (this is `showNameNow`'s rule).
- No show recorded yet: `{ name: now.show, rounds: [] }` merged the same way.

The `on screen` marker becomes a property of the last round of the live show when
`now.map !== null`, rather than a whole separate column of placeholder text.

`Loading the next round…` narrows to a live show with no rounds at all. Between rounds with
rounds already loaded, the list stays up — it is strictly more than the placeholder was.

## Badges per round

New in `src/field.ts`, walking the same alive-set as `fieldOf`:

```ts
export function roundFieldsOf(show: Show, players: Player[]): FieldPlayer[][]
```

For each round, with `alive` = the set entering it:

| Round state                     | Badges                                                  |
|---------------------------------|---------------------------------------------------------|
| has `qualified`                 | red for `alive − qualified` — newly out only            |
| no `qualified`                  | grey for all of `alive`                                 |
| final, show has `winners`       | gold 👑 for `winners`, red for `alive − winners`        |
| final, no `winners`             | grey for all of `alive`                                 |

`alive` then becomes `qualified` (or is unchanged when the round did not resolve).

A round nobody read the board for contributes nothing to `alive`, so its deaths surface on the
next round that was read. Round 2 of Solos 1 (`survivors: 14`, no names) draws 21 grey; round 3
then draws 17 red — the 7 that actually went out on round 2 and the 10 on round 3. That is honest
about what was read rather than inventing a split.

A player is drawn at most once per round and never after the round they went out on.

### Chips

The existing `chip` renders `out R3` as a note. Inside a round row that is the row number
repeated, so the note drops to `firsts` only (`⚡3`). Winners keep the crown. Sorting within a
round is alphabetical, except the final where winners come first.

## What changes on screen

`renderShow` drops the single `.beans` grid under the round list. Each `.rnd` grows a `.beans`
row beneath its existing five columns — the round becomes a two-line block, the top line
unchanged.

`renderShowNow` on the dashboard keeps the flat `fieldOf` grid. It is a one-glance panel and
per-round detail does not belong on it.

## Testing

`src/field.test.ts` covers `roundFieldsOf`: newly-out only, an unread round greying the alive
set, deaths surfacing on the next read round, the final splitting winners from losers, an
unfinished final greying its finalists, and an empty show.

`site/results.test.ts` covers the merge: a log round past the recorded ones appearing, a recorded
`first` showing in the live box, a partially recorded show not being drawn twice, and the
between-rounds message surviving.

The existing `renderPlaying` tests move onto the merged path — same assertions, one path.
