# FOM Fall Guys Tournament

Scoring and leaderboard for the Fall Guys solo tournament at the FOM LAN party.

Participant list: https://www.fom.be/compos/view/507

Rules handed to the FOM board: [docs/rules.md](docs/rules.md)

## Scoring

| Achievement                          | Points |
|--------------------------------------|--------|
| Finishing a round first              | 3      |
| Qualifying for a show's final round  | 1      |
| Winning the final                    | 5      |

Simultaneous winners split the 5, rounded down.

## Running the admin

```bash
bun run live               # every save is committed and pushed
bun run dev                # saves stay on this machine
bun run dev --no-record    # and leave the screen alone — see below
```

Both serve the admin on <http://localhost:3000/admin> and the board beside it.

`bun run live` is the event itself: recording a show writes `data/`, commits it under
`data: record show N — Name` and pushes, which rebuilds the published site. `bun run dev`
writes the same files and stops there.

Nothing is pushed unless `data/event.json` and `data/players.json` parse and hold the
shape the board reads. A file that fails is still saved, so no typing is lost, but the
publish is refused with the field named, and the admin carries a banner until it is
fixed. The `Commit & push` button runs the same check under a message you write.

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
PORT=3100 bun run dev
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

| Page       | What it shows                                                                        |
|------------|--------------------------------------------------------------------------------------|
| Dashboard  | Which show and round is on, who is left in it, the podium, and the rest of the field |
| Standings  | Every player with their races, finals, wins and penalties                            |
| Results    | Every show round by round, newest first, with the field coloured                     |
| Rules      | `docs/rules.md`                                                                      |
| Show order | The ten shows, marked played / playing now / upcoming                                |

Every show carries its field: gold won it, green got through the last board read, grey is still in
the round on screen, red is out with the round number that did it. The field is the roster —
everyone in `players.json` who is not an admin and has an `ingame` name — because a player knocked
out in round 1 is named on no screen at all.

Every page but the rules refreshes itself every 15 seconds, so nobody has to reload during
the event. Players who gained points since the last refresh are ringed in green for a few
seconds.

Run from `bun run dev`, the status ribbon comes from the Fall Guys log over `/live.json`, so
it names the show and the round on screen before a single result has been typed in. Only
the machine running the game can serve that file; on GitHub Pages it is absent and the
ribbon falls back to `event.json` — the last show recorded, and the round after the last
one entered.

So the board projected at the LAN should be the local one on `http://localhost:3000`. The
published site is for everyone else, and is as current as the last push.

Pushing to `main` publishes `dist/` to GitHub Pages via
[.github/workflows/pages.yml](.github/workflows/pages.yml). Set the Pages source to
"GitHub Actions" in the repository settings.

## Screenshots

Shooting by hand is the backup now — see [Capturing the screens
automatically](#capturing-the-screens-automatically). It still works exactly as described here, and
a hand-shot capture and a frame cut from the recording are treated identically.

ShareX captures the active window with `Alt + Print Screen`. Rebind under Hotkey
settings → `...` → Task = Capture → Active window.

Set Fall Guys to Borderless (Settings → Display → Display Mode, or `Alt + Enter`).
Exclusive fullscreen captures as a black frame.

Shoot the race finish, the finalists and the winner screen. A final with several winners has
no winner screen; shoot the surviving beans instead.

The admin shows them in a panel down the right. Click a round, the finalists block or the
winners block and the panel fills with the captures taken during it, so the names can be read
off the screen instead of remembered. Click a capture for full resolution.

It reads `Documents/ShareX/Screenshots` for any user on the C: drive, and inside it only the
month folder the event falls in, taken from `date` in `event.json`. Set `SHAREX_DIR` to
override. Nothing is copied and nothing is committed — the folder is only ever read.

A capture is placed by its modified time against the log's round times, so a file copied into
the folder lands wherever its new mtime falls. Anything that matches no round shows under
**This show, between rounds** or **Outside every show** at the bottom of the panel.

The log stamps every line with a **UTC** clock and no date, so the day comes from `date` in
`event.json` and every time on the admin page is converted to `Europe/Brussels`. A log started
the day before the event would shift every window.

## Reading names off the captures

The admin reads the captures and fills the names it finds into fields that are still blank. Three
screens are read:

| Screen              | Fills                 | Read from                        |
|---------------------|-----------------------|----------------------------------|
| Qualification board | `rounds[n].qualified` | the name over every green card   |
| Winner screen       | `winners`             | the nameplate under the bean     |
| Qualified toast     | `rounds[n].first`     | the pill wearing the gold trophy |

The trophy is what marks first place, not the pill's position — the column does not run in finish
order.

The board comes up after **every** round, and every one of them is read: the survivors go onto the
round they were read after. The finalists are the survivors of the round before the final, so they
are not stored separately.

Names are matched against the `ingame` names in `data/players.json`. Everyone playing the
tournament is registered, so the roster is the answer key rather than a spelling aid: each name
read is given the one roster entry it is closest to, and a name already used on that board is not
offered again. Where two entries are equally close the field is left as read rather than guessed
at — so two players whose in-game names differ by a single character cannot be told apart, which
is worth a glance over `players.json` once everyone has reported.

A name the roster does not hold goes in as it was read. That is what happens when testing outside
the tournament, where players are not registered.

Only blank fields are filled, and a filled field is ringed in green with the capture it came from
on hover. Type over one and it is yours — nothing later overwrites it, and clearing it on purpose
does not bring the name back.

### Scoring the reading

```bash
bun run scripts/ocr-score.ts
```

Reads the boards listed in [data/ocr-truth.json](data/ocr-truth.json) — named by eye, in board
order — and reports how many names come back exactly, the character error rate, and how many reach
the right roster entry. That last number is the one to move: a board's own names stand in for the
roster, so matching is measurable without a capture of the tournament.

Captures are never committed, so a board the file names that is not on this machine is skipped.

Not read: the lobby's **View Names** screen, whose nametags follow the beans around in 3D and
overlap into pileups in a full lobby, and any name not written in the Latin alphabet.

The first run downloads Tesseract's English model, about 5MB, into `.ocr-cache/`. **Do that once
before the event** — nothing afterwards needs the network. Read names are cached in the same
folder against each file's modified time, so restarting the server does not re-read everything.

## Capturing the screens automatically

The server records the screen for the whole event and cuts the frames the reader needs out of the
recording afterwards, so nothing has to be shot by hand. The screen naming who finished first can be
gone in a fraction of a second when a dozen beans qualify together, and no capture that reacts to an
event can catch it.

Frames are found by the clock stamp **inside** the log line, never by when the line arrived, so a
log that flushed late still names the right frame. The same recording is cut into one mp4 per show.

```bash
CAPTURE_OUTPUT=1 bun run live      # records
bun run dev --no-record            # does not
```

Recording is **on by default**, because a show that was not recorded cannot be recovered. It grabs a
whole monitor and writes gigabytes an hour, so `--no-record` is there for working on the admin.
Either way the console says `Recording  on` with the folder, or `off`, on every start.

| Setting          | Default                                  | What it is                                          |
|------------------|------------------------------------------|-----------------------------------------------------|
| `CAPTURE_OUTPUT` | `0`                                      | Which monitor to record, numbered from 0            |
| `CAPTURE_DIR`    | `/mnt/c/temp/FallGuysCapture`            | Where segments, clips and frames go                 |
| `CAPTURE_AUDIO`  | `virtual-audio-capturer`                 | dshow device to record sound from; `off` for silent |
| `FFMPEG_PATH`    | `/mnt/c/Program Files/ShareX/ffmpeg.exe` | ShareX ships the one this uses                      |

The header carries a **recording** badge. If it reads `NOT RECORDING`, nothing is being captured
and `Alt + Print Screen` is the only thing still working.

One mp4 per show lands in `CAPTURE_DIR/shows`, named `2026-09-02-show-01-slime-climb.mp4`, cut from
the first round to just past the victory screen without re-encoding. The raw recording sits under
`CAPTURE_DIR/segments` in one folder per run, stamped `2026-09-02T21h41m03`: every start of the
server, and every recovery from an ffmpeg that died mid-event, gets its own, so nothing ever writes
over footage that is already there. A clip cut across such a recovery has a jump in it, and the
console says which one. Nothing is cleaned up: `CAPTURE_DIR` is yours to empty. A static desktop
runs about 1.7 Mbps, so budget a few gigabytes an hour and leave 30GB free.

### Before the event

1. Install `virtual-audio-capturer` (from the screen-capture-recorder installer) and confirm ffmpeg
   lists it:
   ```bash
   "/mnt/c/Program Files/ShareX/ffmpeg.exe" -list_devices true -f dshow -i dummy
   ```
   Without it the recording still happens, silently, and the badge says `recording — no sound`.
2. Find the monitor Fall Guys is on, set `CAPTURE_OUTPUT`, record ten seconds and watch it back.
   Getting this wrong records the admin screen instead of the game.
3. Play one round and confirm a frame with a trophy pill turns up in the capture panel.

This machine has no NVENC or AMF encoder, so the recording uses Quick Sync (`h264_qsv`).

## Tests

```bash
bun install
bun test
bun run typecheck
```
