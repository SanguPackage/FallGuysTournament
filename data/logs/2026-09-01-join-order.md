# 2026-09-01 — do playerIDs follow lobby join order?

**No.** Lobby joined in the order SuperFall99 (host), oopman, nicksonn, f1xel;
show `event_only_button_bashers_template` assigned:

| playerID | Name        | How it was established                          |
|----------|-------------|-------------------------------------------------|
| 1        | SuperFall99 | `bootstrap for local player`                    |
| 2        | nicksonn    | remaining ID once the others were known         |
| 3        | oopman      | won round 2, logged as `winnerPlayerId:3`       |
| 4        | f1xel       | lost round 2; was the host's round-1 opponent   |

oopman and nicksonn are swapped relative to join order, so the host cannot build the
mapping by watching the lobby fill.

What did work: two observations by name — the host's own opponent, and one round
winner — resolved all four players. 1v1 shows are the cheapest place to do this, since
every round splits the field.

Still open: whether these IDs survive into the next show of the same lobby.

## Lobby 2

The host rebuilt the lobby at 20:20:57 (`LeaveParty, reason: PrivateLobby_Host`). In the
solos show that followed, `winnerPlayerId:4` was oopman — ID 3 in lobby 1. Recreating a
lobby therefore reassigns IDs.

## Resolved: IDs are not stable, and log parsing is dropped

Tested on the night: playerIDs do **not** survive from one show to the next, even within
a single lobby that was never rebuilt. The mapping therefore cannot be established once
and reused, and it cannot be reconstructed retroactively from a finished log either.

Re-deriving it would mean naming players by observation in every show, which costs more
attention than typing the results does.

**Decision: results are entered by hand through the CLI. The log is not parsed for
scoring.** `src/log.ts` and its tests stay in the repo as a record of what the log does
contain, but nothing in the scoring path calls them.
