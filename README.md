# FOM Fall Guys Tournament

Scoring and leaderboard for the Fall Guys solo tournament at the FOM LAN party.

Participant list: https://www.fom.be/compos/view/507

Rules handed to the FOM board: [docs/rules.md](docs/rules.md)

## Scoring

| Achievement                           | Points |
|---------------------------------------|--------|
| First across the line in a race round | 3      |
| Qualifying for a show's final round   | 1      |
| Winning the final                     | 5      |

Simultaneous winners split the 5, rounded down.

## Running the event

```bash
bun run cli show      # start a show
bun run cli round     # record a race or survival round
bun run cli final     # close the show: final map, finalists, winners
bun run cli penalty   # deduct points
bun run cli shows 21  # which shows work at this headcount
bun run cli board     # print current standings
```

Each command commits `data/event.json`, and pushes when a remote is configured. Add
`--no-commit` for a dry run.

## Players

`data/players.json` maps FOM names to in-game names. Every participant is listed with
their FOM name; add `ingame` as people report theirs in the Discord channel.

```json
{ "fom": "Optinux_Prime", "ingame": "OptiBean", "discord": "optinux" }
```

A player without an `ingame` shows on the leaderboard on zero and cannot be scored.

The admin runs the event instead of competing, and is marked so they stay off the
leaderboard:

```json
{ "fom": "Wouter_Van_Schandevijl", "admin": true }
```

## Scoring is entered by hand

The game's `Player.log` records every player's result, but against numeric playerIDs
that carry no name and change from show to show. Log parsing was tried and dropped; see
`data/logs/2026-09-01-join-order.md`. Results go in through the CLI.

## Show limits

`data/shows.json` holds the minimum and maximum player count for every custom playlist,
taken from the
[Fall Guys wiki](https://fallguysultimateknockout.fandom.com/wiki/Custom_Games). A show
the headcount cannot support is skipped. Refresh it if the game changes the numbers.

## Admin UI

```bash
bun run build
bun run dev     # http://localhost:3000/admin
```

The admin page runs only against the local dev server, never on GitHub Pages. It reads
the Fall Guys log to fill in each show's rounds, player counts and finals, so the only
typing is names. It writes `data/players.json` and `data/event.json` directly.

Names already entered are offered as a dropdown on every name field, so a player is
typed out once and picked from the list after that.

**Commit & push** commits `data/` and pushes, which rebuilds the public site. Only
`data/` is committed, so anything else staged is left alone.

It finds `Player.log` under `AppData/LocalLow/Mediatonic/FallGuys_client` for any user
on the C: drive. Set `FALLGUYS_LOG` to override.

Shows must be recorded in the order they were played: only the next unrecorded show is
editable, so its number matches the log.

Player IDs in the log are reassigned every show — even inside one lobby — so the log can
never say *who* did something. See
[data/logs/2026-09-01-join-order.md](data/logs/2026-09-01-join-order.md).

## The site

```bash
bun run build   # bundle site/ and data/ into dist/
bun run dev     # serve dist/ on http://localhost:3000, admin on /admin
```

Five pages, all built from `data/` and `docs/rules.md`:

| Page       | What it shows                                                        |
|------------|----------------------------------------------------------------------|
| Dashboard  | Which show and round is on, the podium, and the rest of the field     |
| Standings  | Every player with their races, finals, wins and penalties             |
| Results    | Every show round by round, newest first                               |
| Rules      | `docs/rules.md`                                                       |
| Show order | The ten shows, marked played / playing now / upcoming                 |

Every page but the rules refreshes itself every 15 seconds, so nobody has to reload during
the event. Players who gained points since the last refresh are ringed in green for a few
seconds.

The status ribbon is derived from what has been recorded: the last show in `event.json` is
the one being played, and the round is one past the last one entered. A show with `winners`
is finished.

Pushing to `main` publishes `dist/` to GitHub Pages via
[.github/workflows/pages.yml](.github/workflows/pages.yml). Set the Pages source to
"GitHub Actions" in the repository settings.

## Screenshots

ShareX captures the active window with `Alt + Print Screen`. Rebind under Hotkey
settings → `...` → Task = Capture → Active window.

Set Fall Guys to Borderless (Settings → Display → Display Mode, or `Alt + Enter`).
Exclusive fullscreen captures as a black frame.

## Tests

```bash
bun install
bun test
bun run typecheck
```
