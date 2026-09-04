# Seed the roster from the first qualification board

For test runs, where nobody has typed a roster in. When `data/players.json` holds no player,
the first show's round-1 qualification board becomes the official roster.

## Why

A test run has no registered players, so every OCR'd name is unmatched, the field is empty and
the leaderboard has nobody to rank. Typing a throwaway roster before each run is the busywork
this removes.

## The rule

Seeding happens on the poll that first reads the board, and only when all of these hold:

- `data/players.json` has no player with an `ingame` name and `admin` not true.
- A capture placed at `showIndex 0`, `roundIndex 0` reads as `screen: "grid"` with tokens.

The bare-roster test is the whole safeguard. On game day the roster is registered, so the
condition never comes true and nothing fires.

## `src/ocr/seed.ts`

Pure, no I/O:

```ts
export function seededRoster(
  players: Player[],
  shots: PlacedShot[],
  reads: Record<string, ShotRead>,
): Player[] | undefined
```

| Step        | Rule                                                                             |
|-------------|----------------------------------------------------------------------------------|
| Bare check  | `players.filter(p => !p.admin && p.ingame).length === 0`, else `undefined`        |
| Pick board  | shots with `showIndex === 0`, `roundIndex === 0`, `reads[file].screen === "grid"` |
| Pick one    | most tokens wins; ties go to the latest `takenAt`                                 |
| Build       | keep every existing row, append `{ ingame: token }` per token not already there   |
| Nothing new | `undefined`                                                                      |

Grid tokens have already been through `cleanToken` and `dropLevel` in `src/ocr/read.ts`, so
they need no further cleaning here.

## Call site

`scripts/serve.ts`, in the `/api/state` handler between loading players and `fillsFor`. When
`seededRoster` returns rows:

1. `Bun.write` them to `PLAYERS_PATH`.
2. Build `roster` from the new rows, so `fillsFor` in that same request returns the round-1 fill
   already matched.
3. Write one transcript line naming the capture and how many players it seeded.

No publish and no commit from the poll: publishing commits the whole of `data/`, and a GET must
not push. The seeded file rides along on the next admin save.

## Out of scope

- **Seeding twice.** After the write the roster is no longer bare, so a second show finds it full.
- **Growing the roster from later boards.** Every later board is a subset of round 1's.
- **Correcting a misread name.** It stays until edited in the admin players editor, which already
  saves through `PUT /api/players`.
- **Crown ranks.** The board wears them and `dropLevel` throws them away. Nothing reads them off
  a capture today and this does not change that.

## Known cost

A round-1 board names the survivors, not the lobby. Everyone knocked out in round 1 is on no
screen the seed reads, so they are absent from the roster for the rest of the test run and the
field shows a smaller lobby than played. The screen that names everyone is the pre-settle board
`identify()` calls `field`, whose tokens `read.ts` discards; reading it is the way out if this
ever matters.

## Tests — `src/ocr/seed.test.ts`

- A bare roster seeds every name off the board.
- An admin-only roster seeds and keeps the admin row.
- A roster with a player returns `undefined`.
- No round-1 grid read returns `undefined`.
- Two captures of the same board pick the one with more tokens.
- A token already on the roster is not added twice.
