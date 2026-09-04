# Handoff — the capture pipeline is too slow

The frames a round produces reach the admin two to five minutes after the round ends, and a moment
that finds nothing delays every moment behind it, including the ones from shows played since. On
2026-09-04 shows 2 and 3 produced no frames at all for as long as the server was chewing on show 1.
The event is Saturday 14:00–19:00, where a board has to be readable while the next round loads.

## What is slow, measured

Against the 2026-09-04 18:02 show, `bun run scripts/bench-capture.ts` (best of 3, recorder running):

| case            | before                     | after                        |
| --------------- | -------------------------- | ---------------------------- |
| `field-r1`      | 6.8s · 4 spawns · 5 kept   | 7.9s · 3 spawns · 10 kept    |
| `finalists-r3`  | 5.9s · 5 spawns · 5 kept   | 3.6s · 3 spawns · 5 kept     |
| `winner-r4`     | 3.5s · 3 spawns · 5 kept   | 2.2s · 2 spawns · 5 kept     |
| `first-miss`    | 29.2s · 315 decoded        | 29.7s · 315 decoded          |

`field-r1` now files the whole-field frames and the board's own in one pass, so its row is two
moments' work. A miss is unchanged: it has the whole window to read either way.

What that leaves, board on screen → readable in the admin, on the same show: round 1 took 75s and
round 2 took 61s, of which the pass itself was ~24s. The rest is the two gates below.

| Observation | Where |
|--------------------------------------------------------------|------------------------------------|
| A board is only a moment once the round after it has loaded  | `momentsIn`, `src/capture/moments.ts` |
| Which on 2026-09-04 was 16–40s after the round's last result | `Player.log`                        |
| A `first` moment that finds no toast takes ~30s              | `first-miss` above                  |
| It is retried 3× before being given up                       | `MAX_ATTEMPTS`, `src/capture/ledger.ts:5` |
| A failed moment first waits 90s to be allowed to fail        | `SETTLE_MS`, `src/capture/pipeline.ts` |
| One job runs at a time                                       | `Serial`, `src/capture/serial.ts`   |
| 16 captures re-read through OCR took 1m01s                   | admin `re-read`                     |

A `first` window is `-500ms … +10_000ms` at 30fps (`WINDOW`, `src/capture/moments.ts`) — about
315 frames. The frames are 3840x2400 — a 16:10 monitor — and opening one to extract from is what a
pass costs, which is why the search stops at the segment that filled its quota.

## Ideas worth measuring, not a plan

1. Skip Jimp: have ffmpeg write raw downscaled RGB and classify straight off it. Decoding is still
   most of a miss — 27s of `first-miss`'s 30s.
2. Parallelism: extraction is ffmpeg/QSV, classification is CPU. Two or three workers may be free.
3. The toast at 30fps over ten seconds is what a miss pays for. A coarse sweep to find where the
   pill is, then full rate over the second either side, would cut it — the grid and winner windows
   no longer need this, since they stop at the segment that filled the quota.

## Ground rules

- Recording must not stop or gap. It survives a server crash (ffmpeg is a separate process); a
  restart now kills the orphan it left (`src/capture/orphans.ts`).
- No moment may be lost to make it faster: the winner screen and the first-place toast are the two
  that cannot be re-shot.
- TDD, tests green, `bun run typecheck` clean.

## Where to start

- `src/capture/pipeline.ts` — `captureMoment`, the extract/pick loop.
- `src/capture/pick.ts` — what it decodes and how early it stops.
- `src/capture/moments.ts` — the windows and frame rates.
- `src/capture/serial.ts` — the one-at-a-time queue.
- `src/ocr/recognizers.ts` — `identify`, run once per candidate frame.

`scripts/bench-capture.ts` is the number that moves. Point `BENCH_DIR` at a copy of a real
`CAPTURE_DIR` run — `segments/<run>/` plus the `Player.log` naming the moments in it. `CAPTURE_DIR`
is emptied between test runs, so keep one somewhere before starting.

## Already fixed, do not re-diagnose

- Letterboxed captures (16:10 monitor, 120px bars) broke the winner recogniser — `cropBars`,
  `src/ocr/letterbox.ts`.
- A session that crosses midnight before its first show dates every stamp a day early
  (`logDate` takes the log's first dated line). Restarting the game before the event avoids it;
  the code is still wrong. `src/screenshots.ts:56`, `scripts/serve.ts:83`.
- A moment used to wait for its whole window to close before reading any of it. It now reads what
  the recording has passed, once that is `EARLY_MS` worth, and keeps what it finds — `pick` takes
  the earliest frames, so a short pass is a prefix of what the long one would have given.
- Round one's board was pulled twice, once for the field and once for the finalists. It is one
  moment carrying `also`, and `pick` fills both screens from one read.
- Newest moment first, so a live round never waits on an old failure — `Serial`.
- A pass that read frames and matched none of them is given up on rather than retried — `exhausted`.
- A round that reported its whole result set on one tick draws no trophy pill, so it gets no `first`
  moment. It is not the map: Bubble Trouble is a hunt whose qualifiers trickled in over 88s and had
  a toast, where Volleyfall's fourteen results all landed on 18:54:40 and had none. `firstQualifiedAt
  === endedAt` names it, and across the two logs of 2026-09-04 it picks out exactly the three rounds
  that filed nothing — Volleyfall, Roll Off, Lost Temple. Each had cost a 315-frame pass.

## Already tried, do not re-attempt

Triggering a board off the round ending rather than off the next round loading. There is no safe
signal for "the round is over" short of the next level load: `endedAt` is the last result *so far*,
and on 2026-09-04 the longest gap *between* results inside a round (16s, 27s, 19s, 45s) was as long
as the gap from the last result to the next round loading (40s, 16s, 20s). Any quiet threshold that
does not fire mid-round is longer than the wait it would replace — and a window aimed mid-round
finds no board, which spends the moment for good.
