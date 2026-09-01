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

## Show limits

`data/shows.json` holds the minimum and maximum player count for every custom playlist,
taken from the
[Fall Guys wiki](https://fallguysultimateknockout.fandom.com/wiki/Custom_Games). A show
the headcount cannot support is skipped. Refresh it if the game changes the numbers.

## Leaderboard

```bash
bun run build   # bundle site/ and data/ into dist/
bun run dev     # serve dist/ on http://localhost:3000
```

Pushing to `main` publishes `dist/` to GitHub Pages via
[.github/workflows/pages.yml](.github/workflows/pages.yml). Set the Pages source to
"GitHub Actions" in the repository settings.

## Tests

```bash
bun test
```
