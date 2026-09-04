# Handoff — the capture pipeline is too slow

The frames a round produces reach the admin two to five minutes after the round ends, and a moment
that finds nothing delays every moment behind it, including the ones from shows played since. On
2026-09-04 shows 2 and 3 produced no frames at all for as long as the server was chewing on show 1.
The event is Saturday 14:00–19:00, where a board has to be readable while the next round loads.

## What is slow, measured

| Observation | Where |
|--------------------------------------------------------------|------------------------------------|
| Board frames landed ~3 min after the round ended             | `shows/*/transcript.txt`, `queue` lines |
| A `first` moment that finds no toast takes ~1.5–2 min        | one pass over its window            |
| It is retried 3× before being given up                       | `MAX_ATTEMPTS`, `src/capture/ledger.ts:5` |
| A failed moment first waits 90s to be allowed to fail        | `SETTLE_MS`, `src/capture/pipeline.ts:43` |
| One job runs at a time                                       | `Serial`, `src/capture/serial.ts`   |
| 16 captures re-read through OCR took 1m01s                   | admin `re-read`                     |

A `first` window is `-500ms … +10_000ms` at 30fps (`WINDOW`, `src/capture/moments.ts:48`) — about
315 frames. `captureMoment` extracts every one to JPEG, then `pick` decodes each (Jimp) and
classifies it (`identify`) until it has kept 5. A moment that succeeds early stops decoding; one
that finds nothing pays for the whole window, three times over.

The frames are now 3840x2400 — a 16:10 monitor. Decoding 315 4K JPEGs is the bulk of the cost, and
it is roughly four times what the same code paid on last week's 1080p captures.

## Ideas worth measuring, not a plan

1. Classify small, keep big. Extract a downscaled copy for `pick` (the recognizers all measure as a
   share of the frame) and re-extract only the kept instants at full resolution for OCR.
2. Two-pass search: a coarse sweep at 3–5fps to find where the toast is, then full rate over the
   second either side of the hit.
3. Give up cheaply: if a whole pass classified nothing at all, a second identical pass over the same
   footage will not either. `MAX_ATTEMPTS` is there for footage that was not on disk yet — that is
   what `SETTLE_MS` already guards.
4. Priority, so a live round never waits on an old failure: newest moment first, or one queue per
   show, or a lane for the show being played.
5. Parallelism: extraction is ffmpeg/QSV, classification is CPU. Two or three workers may be free.
6. Skip Jimp: have ffmpeg write raw downscaled RGB and classify straight off it.

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

There is no benchmark yet. Write one first: a saved segment, a known moment, and a number that
moves. `CAPTURE_DIR` is emptied between test runs, so keep a segment folder and its `Player.log`
somewhere before starting.

## Already fixed, do not re-diagnose

- Letterboxed captures (16:10 monitor, 120px bars) broke the winner recogniser — `cropBars`,
  `src/ocr/letterbox.ts`.
- A session that crosses midnight before its first show dates every stamp a day early
  (`logDate` takes the log's first dated line). Restarting the game before the event avoids it;
  the code is still wrong. `src/screenshots.ts:56`, `scripts/serve.ts:83`.
