# FOM Fall Guys Tournament — Design

Date: 2026-09-01

A points system for a Fall Guys solo tournament run at the FOM LAN party: a rules
document for the FOM board, a scoring tool the admin drives during the event, and a
GitHub Pages leaderboard that updates as results are committed.

## 1. Scope

Three deliverables, built in this order:

1. `docs/rules.md` — the rules document handed to the FOM board.
2. A scoring engine plus admin CLI that records round results into JSON and commits them.
3. A GitHub Pages leaderboard rendering that JSON.

Out of scope for this spec: parsing `Player.log` to fill results automatically. See §7.

## 2. Rules document

English, roughly two pages, adapted from `docs/The SquadGoals Honourable International
Tournament.md`. Sections:

| Section          | Content |
|------------------|---------|
| Registration     | Players post their in-game name in the tournament Discord channel so it can be mapped to their FOM name. Unmapped players cannot be scored. |
| Format           | Solo custom lobby, one LAN event. One admin, who spectates rather than competes and self-eliminates at the start of each show. The admin picks which shows to play, based on the player count. |
| Scoring          | See §3. |
| Conduct          | The event is solo. The admin may penalise obvious collaboration between players at their discretion. No exhaustive list of forbidden actions. |
| Admin authority  | Penalties are open-ended: a warning, a point deduction of any size, or exclusion from remaining shows. The admin decides anything the document does not cover. Players may present evidence; there is no right of protest. |
| Tiebreaker       | A tie for first place overall is settled by one extra show between the tied players. Its winner takes first place. |

Deliberately dropped from the source document: piggyback and invisible-surface bans,
the bounty rule, the Jump Showdown barjump bonus, the disconnection matrix, timeout
handling, and server selection. Piggybacking and standing on invisible surfaces are
allowed at this event.

The document says nothing about prizes. There is a prize, but awarding it is the FOM
board's call, not the tournament's, so the rules stay silent on it.

## 3. Scoring rules

| Event                        | Points |
|------------------------------|--------|
| First across the line in a race round | 3 |
| Qualifying into a show's final round  | 1 |
| Winning the final                     | 5 |

Non-race rounds that are not the final (survival, hunt, logic) award nothing — they
have no meaningful first place.

Winning the final and reaching it are cumulative: a final winner scores 6 for that show.

When several players win a final simultaneously — a double crown grab, or a
"0 players remaining" screen — the 5 points are split between them and rounded down.
Two winners take 2 each; three take 1 each.

Leaderboard ordering: points descending, then finals won, then finals reached, then
race wins, then in-game name. This ordering is for display only; a genuine tie for
first is settled by the extra show described in §2.

## 4. Data

Two committed JSON files under `data/`.

`data/players.json` maps in-game identity to the LAN:

```json
{
  "players": [
    { "ingame": "SuperFall99", "fom": "Wouter", "discord": "wouterv" }
  ]
}
```

`data/event.json` holds results, appended to as the event runs:

```json
{
  "name": "FOM 2026",
  "date": "2026-09-01",
  "shows": [
    {
      "name": "Solos",
      "finalists": ["SuperFall99", "Beanicus", "Tumbleweed"],
      "winners": ["SuperFall99"],
      "rounds": [
        { "map": "Dizzy Heights", "type": "race", "first": "SuperFall99" },
        { "map": "Hoopsie Legends", "type": "survival" },
        { "map": "Fall Mountain", "type": "final" }
      ]
    }
  ],
  "penalties": [
    { "ingame": "Beanicus", "points": -3, "reason": "obvious collaboration, show 2" }
  ]
}
```

`finalists` and `winners` are properties of the show, not of a round — reaching and
winning the final are facts about a player's run through the whole show. The final round
still appears in `rounds` so its map is recorded, but it carries no result of its own.

Round `type` is one of `race`, `survival`, `final`. A round that is both a race and the
final is recorded as `final`, and scores as a final only. A show has at most one `final`
round.

Players are referenced by in-game name throughout; FOM names are a presentation concern
resolved at render time.

## 5. Components

**`src/scoring.ts`** — a pure function `score(event, players) => LeaderboardRow[]`. No
file or network access, no git. This is where the rules of §3 live and where the test
suite concentrates. Built test-first.

**`src/cli.ts`** — the admin's interface during the event. Thin: prompts for input,
validates in-game names against `players.json`, appends to `event.json`, and commits.
Subcommands:

| Command   | Effect |
|-----------|--------|
| `show`    | Start a new show. |
| `round`   | Record a round result into the current show. |
| `final`   | Close the current show: record its final's map, finalists and winners. |
| `penalty` | Record a point deduction. |
| `board`   | Print current standings to the terminal. |

Writes commit and push by default, since a committed result is what updates the public
leaderboard. `--no-commit` suppresses that for corrections and dry runs.

**`site/`** — `index.html` plus a TypeScript entry point, bundled with `bun build`. It
fetches the two JSON files and renders the leaderboard, joining on in-game name to show
FOM names. A GitHub Actions workflow builds `site/` and publishes to Pages on every push
to `main`, copying `data/*.json` into the published output.

## 6. Flow

The admin runs a show, records each round through the CLI, and the commit triggers the
Pages build. Players refresh the leaderboard URL between shows.

Errors the CLI must handle: an in-game name not present in `players.json` (reject, list
near matches), recording a round with no show started (reject), a winner who is not
among that show's `finalists` (reject), and an empty `winners` array (accept — a
timed-out final awards the 1-point finalist bonus but no win).

## 7. Log parsing — deferred

Fall Guys writes `Player.log` (Windows:
`%AppData%\..\LocalLow\Mediatonic\FallGuys_client\Player.log`), and the community tool
FallGuysStats parses it for round names, qualification and placement. Because the admin
spectates every round, their log should cover the whole event.

What is unverified: whether the log records placements for *all* lobby players or only
the local one. This is version-dependent. Before building a parser, capture a real
`Player.log` from a machine that has played a custom lobby and confirm the data is
there.

If it is, the parser becomes an autofill layer that proposes round results for the CLI
to confirm. It never becomes a dependency: manual entry stays the fallback, and the CLI
is needed regardless for penalties and corrections.

Screenshot OCR was considered and rejected — slower and more fragile than typing the
result.
