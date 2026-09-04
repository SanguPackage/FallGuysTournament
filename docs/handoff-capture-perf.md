# Handoff — the capture pipeline starves the admin server

## The bug

`[Bun.serve]: request timed out after 10 seconds`, seen the moment a show closed. Bun aborted an
`/api/state` poll that got no event-loop time for 10s. The timeout is the symptom: frame decoding
runs on the server's main thread and holds it.

`frameFrom` (`src/ocr/frame.ts:37`) is `Jimp.read` — a synchronous pure-JS JPEG decode. Two places
call it in bulk:

- `pick` (`src/capture/pick.ts:37`) classifies every candidate frame of a moment until it has 5 of
  each screen it wants. A `first` moment is 10.5s of footage at 30fps ≈ 315 candidates.
- `ReadQueue` (`src/ocr/queue.ts`) OCRs every capture that lands, one tesseract call per name card.

Measured on `/mnt/c/temp/FallGuysCapture/shows/show-2026-09-04T19h04-solos-2` (WSL, this box):

| Work                                      | Cost                                     |
| ----------------------------------------- | ---------------------------------------- |
| One classified frame @1080p               | 780–1130 ms, event loop 86% blocked      |
| Same frame @540p                          | 57 ms, 37% blocked                       |
| One grid read, 14 name cards              | 8.0 s (~570 ms per card)                 |
| 5 finalists boards through the read queue | 25.3 s wall, 11.5 s blocked, worst 2.2 s |

The tournament roster is 30 players, so a round-1 board carries ~2× the name cards measured above:
~17s per capture, ~85s per 5-frame pull.

## What to change

Three independent changes. TDD, `bun test` after each, zero linter warnings, one commit per change.

### 1. Classify at 540p

`CLASSIFY_HEIGHT` is 1080 (`src/capture/command.ts:59`), so the classify pass decodes full-size
frames. ffmpeg already scales on the way out (`extractArgv`, used at `src/capture/pipeline.ts:158`),
so this is a constant change — 14–20× cheaper.

The recognizers measure fractions of the frame (`src/ocr/recognizers.ts`, `src/ocr/geometry.ts`), so
they should survive it, but that is the thing to prove: run the fixtures in `src/ocr/fixtures.test.ts`
against downscaled copies of `src/ocr/samples` before trusting it. If a threshold is resolution-bound,
either fix the threshold or settle on the smallest height that still identifies every sample.

Kept frames are re-pulled at full size for OCR (`fullFrames`, `src/capture/pipeline.ts:193`), so
reading accuracy is not affected either way.

### 2. Read the last frame of a pull first

A pull writes 5 frames of the same screen (`captureFile`, `src/capture/layout.ts:17` —
`round-NN-<kind>-NN.jpg`); `queueReads` (`scripts/serve.ts:229`) offers all 5 to the OCR queue. Read
the last one, and only fall back to the earlier frames of that pull when it yields no tokens. ~5×
less OCR.

The admin panel already groups captures this way: `pullOf` in `site/admin-model.ts` strips the
trailing frame index and is what `showsCapture` folds a pull down by. Move that helper to
`src/screenshots.ts` and have both sides import it rather than growing a second copy — the panel
should unfold the frame that was actually read.

Put the choice in a pure function (something like `src/ocr/pulls.ts`, `toRead(shots, reads)` →
the files to offer), so it is testable without a server.

### 3. Decode and OCR off the main thread

The durable fix: no amount of pipeline work should be able to stall `/api/state` again.

`CaptureDeps` already injects `frameOf`/`screenOf` (`src/capture/pipeline.ts:34`, wired at
`scripts/serve.ts:407`), so the classify side swaps behind that seam. The OCR side goes through
`ReadQueue`'s injected `read`. One `node:worker_threads` worker owning both Jimp and tesseract is
enough — the queue is serial anyway, and the point is to get the work off the loop, not to
parallelise it.

`closeReader` (`src/ocr/read.ts:53`) and the shutdown path in `scripts/serve.ts` have to tear the
worker down, or the server will not exit.

## How to verify

The probes used to get the numbers above: sample the event loop with a 20ms `setInterval`, sum the
lag over a run, and report worst single block. Rebuild them under the scratchpad — they are not
worth committing.

End to end: start `bun run dev` with a recording present, force a sweep of a show's moments, and
poll `/api/state` throughout. It must answer in well under 10s while a pull is running. Do not add
`idleTimeout` to `Bun.serve` (`scripts/serve.ts:453`) — that hides the stall instead of removing it.
