# Live transcript

One line per thing that happened, in the order it happened, on the terminal and in a file on disk.
Replaces the Tesseract chatter (`Detected 17 diacritics`, `Estimating resolution as 1725`) that is
currently the only thing the console says — and says in red, as if it mattered.

## Shape

```
HH:MM:SS  lane    what happened                                        mark
└─ 8 ─┘  └─ 6 ─┘  └────────────── free text, ends where it ends ──┘  └─ 8 ─┘
```

Shows and rounds break the stream with a rule, so a glance finds the boundary without reading.
Everything else is one flat line. No indentation, no nesting, no spinners — the file and the
terminal are the same text.

## What it looks like

```
━━━━ SHOW 4 ━━ classic_solo_main_show ━━ 24 in the lobby ━━━━━━━━━━━ 23:24:48 ━━━━

──── ROUND 1 ── Tundra Run · race ───────────────────────────────────── 23:24:51 ──
23:25:57  log     first across the line · bean 17
23:25:57  clip    toast window 23:25:55 → 23:26:03 · 30fps · segment 7 @ 04:12
23:26:04  shots   5 frames kept of 240 · round-01-first-race-finisher-{01..05}.jpg
23:26:09  ocr     toast   round-01-first-race-finisher-02.jpg → "BeckitoBurrito"      ✓ roster
23:26:09  fill    round 1 · first ← BeckitoBurrito
23:27:04  log     round over · 23 qualified, 0 out

──── ROUND 2 ── Hoopsie Legends · hunt ──────────────────────────────── 23:27:10 ──
23:28:17  log     first through · bean 4
23:28:24  shots   5 frames kept of 240 · round-02-first-race-finisher-{01..05}.jpg
23:28:31  ocr     ·       round-02-first-race-finisher-01.jpg → nothing worth reading
23:28:38  ocr     toast   round-02-first-race-finisher-03.jpg → "FLAC0_XR"            ~ FLACO_XR
23:28:38  fill    round 2 · first ← FLACO_XR
23:29:38  log     round over · 16 qualified, 0 out

──── ROUND 3 ── Stompin' Ground · survival ──────────────────────────── 23:29:43 ──
23:31:15  log     first through · bean 9
23:31:22  shots   3 frames kept of 90 · round-03-finalists-board-{01..03}.jpg
23:31:29  ocr     grid    round-03-finalists-board-02.jpg → 15 names          ⚠ 2 unclaimed
23:31:29  fill    round 3 · qualified ← 13 names                           ⚠ "LavishBoss3S30"
23:31:30  log     round over · 15 qualified, 1 out

──── ROUND 4 ── Thin Ice · final ────────────────────────────────────── 23:31:35 ──
23:33:01  log     first through · bean 17
23:33:04  log     ★ show won · bean 17
23:33:12  shot    sharex  FallGuys_client_game_WZzKsyP1YH.png → show 4 · winners
23:33:19  ocr     winner  FallGuys_client_game_WZzKsyP1YH.png → "BeckitoBurrito"  ✓ roster
23:33:19  fill    show 4 · winners ← BeckitoBurrito

━━━━ SHOW 4 CLOSED ━━ 4 rounds · 8m16s ━━ won by BeckitoBurrito ━━━━━ 23:33:04 ━━━━
```

And what the admin does to it, which is the half that is invisible today:

```
23:41:02  admin   re-read · show 4 · 11 captures requeued
23:41:02  queue   11 waiting · ~7s each · done by ~23:42:19
23:41:09  queue   1/11  round-01-first-race-finisher-01.jpg
23:41:16  queue   2/11  round-01-first-race-finisher-02.jpg
23:41:23  admin   resync · show 4 · winners · 1 field cleared, 1 fill unspent
23:42:19  queue   drained · 11 read in 1m17s
```

## Lanes

| Lane     | Source                              | Says                                              |
|----------|-------------------------------------|---------------------------------------------------|
| `log`    | [`parseLog`][log]                   | show started, round started, first through, won    |
| `clip`   | [`moments`][mom]                    | which window the recorder is about to pull, at what rate |
| `shots`  | [`placeShots`][shots]               | a recorder frame landing in a show and a slot       |
| `shot`   | [`placeShots`][shots]               | a ShareX capture landing in a show and a slot       |
| `ocr`    | [`readShot`][read]                  | screen it was taken for, and what came out of it    |
| `fill`   | [`fillsFor`][fill]                  | which field a name went into                        |
| `queue`  | [`ReadQueue`][queue]                | depth, position, ETA, drained                       |
| `admin`  | `scripts/serve.ts`                  | re-read, resync, save, publish                      |

[log]: ../src/log.ts
[mom]: ../src/capture/moments.ts
[shots]: ../src/screenshots.ts
[read]: ../src/ocr/read.ts
[fill]: ../src/ocr/autofill.ts
[queue]: ../src/ocr/queue.ts

`queue` is the lane that would have answered *"I clicked resync a lot and now it's turning over
hours"* — the depth and the ETA are the whole answer.

Two lanes are worth being precise about:

- `fill` is the server reporting a name it is **offering** the admin, not one the admin took. The
  browser does the filling, and only tells the server what it did on a resync (`POST /api/note`).
- `clip` is **not wired yet.** The recorder knows its windows but does not report them; every other
  lane on this list is live.

## Marks

The right-hand column carries the one thing worth noticing about a line.

| Mark            | Colour  | Means                                                     |
|-----------------|---------|-----------------------------------------------------------|
| `✓ roster`      | green   | the read matched a registered player exactly               |
| `~ <name>`      | yellow  | matched, but only after correction — shows what it became  |
| `⚠ <token>`     | yellow  | read, claimed by nobody on the roster; needs an eye        |
| `✗ <reason>`    | red     | the read or the capture failed outright                    |
| `★`             | cyan    | the show was won — the one line that colours its own body  |

The roster verdict belongs to the fill, not the read, so an `ocr` line borrows the mark of the fill
that came off the same capture. Everything else stays default: a wall of coloured text reads as
noise, which is the current problem, not the fix.

## On disk

```
<CAPTURE_DIR>/2026-09-02.transcript.txt
<CAPTURE_DIR>/shows/show-2026-09-02T23h25-solos-4/transcript.txt
```

The evening's file is the record. Each show folder also holds its own lines, so a show is one
folder to zip and hand over. `listShowShots` only takes `.png/.jpg`, so it ignores both.

- Append-only, one file per event day, opened on first line and never truncated.
- Plain text: the same bytes as the terminal minus the ANSI, so `diff` and `grep` work.
- A restart appends a `── server started ──` rule rather than starting a new file.
- Lines carry the clock of the thing they describe, not of the moment they were printed. A capture
  read ten minutes late lands under its own timestamp — out of order in the file, in the right
  place in the evening. The file is read back; the clock column is the truth.
- A show's own `transcript.txt` is rewritten, not appended: a line can land long after the show it
  belongs to. A server restart mid-evening leaves earlier shows' copies frozen at what they had.

## Levels

| Flag       | Lanes                                     | For                                  |
|------------|-------------------------------------------|--------------------------------------|
| `--quiet`  | `log`, `fill`, `admin`, and every rule     | tournament night, on the big screen  |
| *(default)*| everything except `queue` position lines  | tournament night, on the laptop      |
| `--trace`  | everything, every capture included        | working on the reader                |

The file always gets `--trace`, whatever the terminal is set to. It costs nothing and it is the
only record once the scrollback is gone.

## Not logged

- Poll requests. The admin polls every few seconds; a line each would bury the rest.
- Tesseract's own diagnostics. Silenced at the worker with `debug_file`, not filtered downstream.
  `src/ocr/quiet.test.ts` reads a capture in a process of its own and fails if stderr says a word.
- Token-by-token OCR output. The transcript says what a capture resolved to; `.ocr-cache/reads.json`
  already holds the raw text for anyone who wants it.
