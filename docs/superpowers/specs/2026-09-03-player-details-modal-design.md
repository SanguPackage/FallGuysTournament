# What one player actually did

The board answers "who is winning". It never answers "what did *I* do?" — the question everyone at
the LAN asks about themselves. Points, race wins and finals are on the standings row, but the row
cannot say *which* show, *which* round, or *which* map. A player who scored 4 points knows the
number and nothing behind it.

This adds a modal: click a player anywhere on the board and get their whole tournament, show by
show, round by round.

## The grid

One row per show, one cell per round.

```
SHOW          R1   R2   R3   R4    RESULT       PTS
1 Solos 1     ✗    ·    ·    ·     Contestant     0
2 Solos 2     ?    ?    ?    ?     Contestant     0
7 Solos 7     ⚡   ✓    ✓    👑    👑 Winner      +6
```

| Mark | Cell state  | Means                                                        |
|------|-------------|--------------------------------------------------------------|
| `⚡` | `first`     | crossed the line first — a race win, worth 3                  |
| `✓`  | `through`   | named on that round's qualification board                     |
| `✗`  | `out`       | still in going into the round, absent from its board          |
| `👑` | `won`       | the show's final, and they won it                             |
| `?`  | `unknown`   | nobody read a board for this round, so it says nothing        |
| `·`  | `none`      | this show has no such round, or they were already out         |

`?` is the one that matters. `roundFieldsOf` returns `playing` for a round with no `qualified`
list, and rendering that as a green `✓` would claim a qualification nobody ever recorded. With
today's data four of seven shows have no boards at all, so the modal is mostly `?` — that is the
data being thin, not the grid being wrong.

Each cell's `title` is its map and type, so hovering reads the show back as a level list.

## The result badge

Four states, in priority order:

| Badge         | When                                                          |
|---------------|---------------------------------------------------------------|
| `👑 Winner`   | named in `show.winners`                                       |
| `Finalist`    | named by `finalistsOf(show)` — through the round before a final |
| `Still in`    | **the last show only**, and `fieldOf` still calls them playing |
| `Contestant`  | everyone else, however far they got                           |

`Still in` is deliberately narrow. `fieldOf` calls a show open whenever its last round is
unresolved, which is true of every show that was typed in short — the four with no boards would
all read "Still in" hours after the LAN ended. Only the show on the wall can still be holding
anyone.

## Points per show

`raceWins × RACE_WIN + finalist × REACHED_FINAL + won × ⌊FINAL_WIN / winners⌋`, reusing the
constants from `src/scoring.ts` rather than restating them.

Penalties are event-level: `event.penalties` names a player and a reason, never a show. So the Pts
column sums to `points − penaltyPoints`, not to the total in the header. The header carries a red
`Penalty` tile when it is non-zero; the grid gets no total row, because a total that does not add
up is worse than no total.

## Modules

| File                    | Role                                                                      |
|-------------------------|---------------------------------------------------------------------------|
| `src/player-detail.ts`  | New. `playerDetail(event, players, fom) → PlayerDetail`. No DOM           |
| `site/player-modal.ts`  | New. `renderPlayerModal(detail) → string`. Header and grid markup          |
| `site/render.ts`        | Standings rows carry a 🔍 opener                                           |
| `site/show-field.ts`    | `.bn` chips carry `data-player`                                            |
| `site/page.ts`          | An empty `<dialog id="player">`, outside `#data`                           |
| `site/main.ts`          | Delegated click, open state, re-render on poll                             |
| `site/styles.css`       | Modal shell, header, grid                                                  |

`src/player-detail.ts` sits beside `field.ts` and `scoring.ts` because it is the same kind of
thing: a pure read of `event.json` and `players.json`. The site renders it; nothing about it needs
a browser.

## Opening and closing

`fom` is the key. It is what `score()` keys rows by, and it is the only field every player has —
`ingame` is absent until they report it on Discord.

- **Standings** — a 🔍 button at the end of each row. A player with no `ingame` gets no button:
  nothing on any board is linked to them, so the modal would be seven empty rows.
- **Dashboard and Results** — the `.bn` chips already name a player, and `FieldPlayer` carries
  `fom` alongside `ingame`. They become the hit target.

A native `<dialog>` opened with `showModal()`, which brings Esc, the focus trap and the backdrop
for free. Closing: the ✕, Esc, or a click on the backdrop.

The pre-rendered pages ship the openers before `main.js` loads, so they are inert for a moment.
`rules.html` and `shows.html` carry no player badges, so they grow no dead buttons.

## Surviving the poll

`site/main.ts` repaints by assigning `target.innerHTML`, which would blow away a dialog inside
`#data`. The dialog lives outside it, and `main.ts` keeps the open player's `fom`; every paint
that finds one re-renders the dialog body from the fresh data. A modal left open during a live
show follows the round along.

## Tests

- `src/player-detail.test.ts` — each badge state, each cell state, the last-show rule for
  `Still in`, per-show points including a shared win, a player with no `ingame`, a player absent
  from the roster.
- `site/player-modal.test.ts` — marks, badge text, escaping, the penalty tile appearing only when
  non-zero.
- `site/render.test.ts` — the opener carries `data-player`, and is absent without an `ingame`.
- `site/show-field.test.ts` — chips carry `data-player`.
