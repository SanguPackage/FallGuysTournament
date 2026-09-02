# Who is still in the show

The results page lists a show's rounds and its winner. While a show is being played it says
nothing about the people in it — who is out, who is through, who took a round first. That is the
thing a room full of players wants on the wall.

This adds one component, shown on two pages, that colours every registered player against the
show being played.

| Colour | Meaning                                                          |
|--------|------------------------------------------------------------------|
| Gold   | Won the show                                                     |
| Green  | Got through the last round whose qualification board has been read |
| Grey   | Still in, and the round on screen has not resolved yet           |
| Red    | Knocked out, with the round number it happened on                 |

## Where the survivors come from

The log records who qualified each round, but against playerIDs that are reassigned every show
and carry no name — see [data/logs/2026-09-01-join-order.md](../../../data/logs/2026-09-01-join-order.md).
Names come from the captures instead.

The qualification board comes up after **every** round, and the OCR already reads every one of
them; `fillsFor` throws away all but the board following the round before the final. Keeping
them all is what makes this possible, and costs no new recognition work.

A player eliminated in round 1 is named on no screen at all, so red needs a baseline. The field
is the roster: every `data/players.json` entry that is not an admin and has an `ingame` name.
Everybody at the LAN plays every show, so a name missing from round 1's board went out in round 1.

## Data model

`qualified` moves onto the round it was read after:

```ts
export interface Round {
  map: string;
  type: RoundType;
  first?: string;
  /** In-game names off the qualification board that came up after this round. */
  qualified?: string[];
}

export interface Show {
  name: string;
  winners?: string[];
  rounds: Round[];
}
```

`Show.finalists` is gone. The finalists are the survivors of the round before the final, so
storing them twice invites the two copies to disagree:

```ts
export function finalistsOf(show: Show): string[];
```

The `rounds.at(-1)?.type === "final"` guard is what makes this safe mid-show. Rounds arrive one
at a time as they are played, so a show three rounds in has a `rounds.at(-2)` that is nobody's
semi-final. Until the final itself is on the list, there are no finalists.

`data/event.json` carries `"finalists": []` on both recorded shows, so the migration is dropping
the key.

## The field

`src/field.ts` is pure and knows nothing about HTML, so both pages and the tests share it.

```ts
export type FieldState = "won" | "through" | "playing" | "out";

export interface FieldPlayer {
  ingame: string;
  fom: string;
  state: FieldState;
  /** 1-based rounds this player crossed first. */
  firsts: number[];
  /** 1-based round they went out on. Only set when out. */
  outAt?: number;
}

export function fieldOf(show: Show, players: Player[]): FieldPlayer[];
```

Everyone starts alive. Each round carrying a `qualified` list moves the players missing from it
to `out` at that round. Then:

| Condition                                                    | State     |
|--------------------------------------------------------------|-----------|
| In `show.winners`                                            | `won`     |
| Dropped by some round's `qualified`                          | `out`     |
| Alive, and a round past the last resolved one is still open  | `playing` |
| Alive, otherwise                                             | `through` |

A finished show has no board after its final — the winner screen stands in — so recorded
`winners` are what resolve it. Without them the final counts as open and its finalists read grey,
which is what they are.

Every living player is in the same state, so green and grey never appear on one board. Chips are
ordered `won`, then alive, then `out`, alphabetically within each group; only the reds move, and
they only sink.

## The component

`site/show-field.ts` renders the chip grid. `site/render.ts` already exports a `renderField` for
the leaderboard's also-rans, hence the separate module.

```
SHOW 3 · Sweet Thieves        Round 2 of 4 · Slime Climb [race] · 12 of 20 through

👑Diego_9942   Bram__ ⚡2      Jef_B            Nele_V
  Optinux ⚡1   Kaas_42 out R1  Serxav_9 out R2  Tom_T out R1
```

It appears twice:

- **results.html** — in every show panel, replacing the `Finalists: …` line. A finished show
  keeps the same grid as its permanent record: winner gold, finalists green, the rest red.
- **index.html** — a panel between the status ribbon and the podium. When no show is running it
  falls back to the last recorded show rather than vanishing, so a projected board never jumps.

A show being played that has not been recorded yet has no `qualified` anywhere, so every chip is
grey. That is accurate: nothing has been read.

## What else moves

Dropping `Show.finalists` reaches the scoring path, so it lands as two commits: the model, the
field and the two pages first, with tests green; the admin UI second.

| File                            | Change                                                        |
|---------------------------------|---------------------------------------------------------------|
| `src/types.ts`                  | `Round.qualified`, `Show.finalists` removed                    |
| `src/rounds.ts`                 | `finalistsOf`                                                  |
| `src/field.ts`                  | new                                                            |
| `src/scoring.ts`                | counts `finalistsOf(show)`                                     |
| `src/event.ts`, `src/cli.ts`    | `closeShow` writes the semi's `qualified`                      |
| `src/data-check.ts`             | validates `rounds[].qualified`                                 |
| `src/ocr/autofill.ts`           | every board fills `{ slot: "qualified", roundIndex }`          |
| `site/show-field.ts`            | new                                                            |
| `site/results.ts`               | show panel gains the grid                                      |
| `site/render.ts`, `site/main.ts`| dashboard panel above the podium                               |
| `site/admin-model.ts`, `site/admin.ts` | per-round **Qualified (N)** block replaces the Finalists block, N from the log's own count |
| `site/styles.css`               | chip styles                                                    |
| `README.md`                     | the OCR table and the page table                               |

The admin change is not optional dressing: with survivors read every round there are four lists a
misread can spoil instead of one, and the log knows how many names each should hold.
