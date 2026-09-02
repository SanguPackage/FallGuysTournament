# Capturing the screens automatically

Design, 2026-09-02.

Today the captures the OCR reads are shot by hand: `Alt + Print Screen` through ShareX, three
times a show. The screen that names who finished first is a column of pills in the top-right
corner, and on a level where ten beans finish together it is gone in a fraction of a second. A
human cannot hit it, and neither can anything that reacts to an event after it has happened.

So nothing reacts. The screen is recorded for the whole event, and the frames are cut out
afterwards, from a log line that says when the moment was.

## Why recording, not triggering

Every trigger-then-capture design loses the same race twice: `Player.log` is buffered, so the line
arrives late, and the toast is already gone by the time a capture fires.

Recording continuously removes the race instead of tightening it. The frame is on disk before the
log line exists, and the line is read for the **clock stamp inside it**, never for when it was
noticed. A line that lands ten seconds late still names the right frame.

It also pays for itself twice: the same recording is cut into one mp4 per show.

| Failure                                            | Why it cannot happen here                                    |
|----------------------------------------------------|--------------------------------------------------------------|
| The log flushed late                               | Frames are found by the stamp in the line, not by arrival     |
| The toast lived 200ms                              | 30fps leaves ~6 frames inside 200ms                           |
| Ten qualifiers pushed the trophy pill off the list | The frames from before the push are on disk too               |
| A name was read wrong, and it is now Sunday        | The recording is still there. Re-extract, or scrub the mp4    |

## Shape

```
ffmpeg  ddagrab(game monitor) + dshow(loopback audio)
   └─→ 30s segments + segments.csv          /mnt/c/FallGuysCapture/segments/

Player.log  ──sweep 5s──→  moments(shows, date)  ──→  ledger: still pending?
                                 │
                                 ├─ frame moments ─→ seek segment ─→ 12–60 frames
                                 │                        └─→ keep those identify() accepts
                                 │                             └─→ captures/YYYY-MM/, mtime = the moment
                                 │
                                 └─ show ended ────→ concat covering segments ─→ -c copy ─→ shows/show-03-slug.mp4
```

Downstream nothing changes. An extracted frame carries the mtime of the moment it shows, so
`placeShots` files it under the right round, `ReadQueue` reads it, and autofill fills the field —
all of it unable to tell the frame from a ShareX capture.

## Moments

The three regexes are already in `src/log.ts`; `absoluteTimes` already turns the log's UTC clock
into epoch milliseconds.

| Moment       | Log position                                     | Window          | fps | Screen wanted  |
|--------------|--------------------------------------------------|-----------------|-----|----------------|
| `first`      | first `succeeded=True` of a round                | t−0.5s … t+1.5s | 30  | toast + trophy |
| `finalists`  | last progress line of the round before the final | t+1s … t+6s     | 2   | grid           |
| `winner`     | `VictoryScene::winnerPlayerId`                   | t+2s … t+8s     | 2   | winner         |
| `show ended` | the next show's `Selected show is`, or `wonAt`   | whole show      | —   | — (clip)       |

Only `first` is pulled at full rate, because only `first` is racing a screen that lives for a
fraction of a second. The grid and the winner screen stand for many seconds, so 2fps over their
window is more than enough and saves decoding fifty frames to throw them away.

A show's clip runs from its **first round's** start − 5s to `wonAt` + 15s, so the lobby wait is not
in it and the victory scene is. A show with no victory scene — several winners, or one abandoned —
ends at its last round's `endedAt` + 15s instead.

Recording is opt-in: the server starts ffmpeg only under `--record`, which `bun run live` passes
and `bun run dev` does not. A day of development records nothing.

## Modules

Each is one file, and the pure ones carry the logic worth testing.

| Module                    | Purpose                                                               | Pure |
|---------------------------|-----------------------------------------------------------------------|------|
| `src/capture/moments.ts`  | `ParsedShow[]` + date → `Moment[]` with windows. All the log reasoning  | yes  |
| `src/capture/segments.ts` | epoch ms → which segment file and what offset inside it                 | yes  |
| `src/capture/command.ts`  | Builds every ffmpeg argv: record, extract, concat, cut                 | yes  |
| `src/capture/pick.ts`     | Extracted frames → the ones worth keeping, by `identify`/`trophyPill`   | yes¹ |
| `src/capture/ledger.ts`   | Which moments are done, so a restart re-extracts nothing               | yes  |
| `src/capture/win-path.ts` | WSL paths → the `C:\` form ffmpeg needs for its file arguments          | yes  |
| `src/capture/paths.ts`    | Where ffmpeg, the recording folder and the capture root are            | yes² |
| `src/capture/serial.ts`   | Background work, one job at a time                                    | no   |
| `src/capture/recorder.ts` | Spawns and supervises the long ffmpeg; reports liveness                | no   |
| `src/capture/pipeline.ts` | Moment → frames on disk with the right mtime, and show clips           | no   |

¹ Pure over a decoded frame; the decode itself is `frameFrom`, which already exists.
² Pure given the environment and an existence check, both injected.

`command.ts` existing separately is what makes the ffmpeg work testable at all: the arguments are
asserted, and only a thin runner is left untested.

### Where files go

Recordings and clips go to `/mnt/c/FallGuysCapture` (`CAPTURE_DIR`). Not the repo — it lives in
Dropbox, and this is tens of gigabytes. Paths are held in WSL form throughout, because that is what
Bun can read; `ffmpeg.exe` is a Windows process, so the file arguments handed to it are converted
to `C:\...` at the one point argv is built.

Extracted frames go to a **second shots root**, `CAPTURE_DIR/captures/YYYY-MM/`, in the same
month-folder layout ShareX uses, so `listShots` works over it unchanged. ShareX's own folder stays
what the README promises: only ever read. `PlacedShot` gains `source: "sharex" | "auto"`, and
`/shot` resolves against the root that source names.

Frame names: `auto-<showNumber>-<moment>-<HHMMSS>-<n>.jpg`.

The frames a moment yields — sixty for a `first`, a dozen for the others — are extracted to a
scratch folder and deleted; only the ones `pick` keeps, at most five, are written to the shots
root. Otherwise the capture panel fills with near-identical frames and the read queue spends
Tesseract on all of them.

## Recording

```
-init_hw_device d3d11va
-filter_complex ddagrab=output_idx=<CAPTURE_OUTPUT>:framerate=30,hwdownload,format=bgra
-f dshow -i audio="virtual-audio-capturer"
-c:v h264_qsv -g 30   -c:a aac
-f segment -segment_time 30 -reset_timestamps 1
        -segment_list segments.csv -segment_list_type csv   seg-%05d.mkv
```

All of this was run against this machine before the plan was written: `ddagrab` captures both
monitors, the segment muxer writes the csv in the shape below, frame extraction and a concat
`-c copy` cut both work, and a missing audio device fails immediately with a nonzero exit.

- `ddagrab` is Desktop Duplication: GPU-side, and unlike GDI it captures a borderless
  hardware-accelerated window instead of a black rectangle.
- `h264_qsv` because this machine's encode hardware is the Intel iGPU. `h264_nvenc` fails with
  "no encode device" and `h264_amf` fails too, so neither is an option here. `libx264` works and
  is the fallback if Quick Sync ever refuses.
- `-g 30` puts a keyframe every second, which is what bounds a `-c copy` clip cut to ~1s of the
  intended start. Without it a copy cut lands wherever the last keyframe was.
- `mkv` because it survives the process being killed. The show clips are mp4.
- Segment times come from `segments.csv`, which the segment muxer writes as
  `file,startSeconds,endSeconds` against the stream, plus the wall clock at which ffmpeg was
  spawned — stored in `recording.json`. Filenames carry no time. A `-strftime` name would be in
  local time while the log's clock is UTC, and WSL's timezone need not be Windows's, so the two
  could not be lined up with confidence; and a numbered name plus `index × 30s` would drift
  whenever a frame dropped.
- The muxer writes a segment's row only once that segment closes, so a moment inside the segment
  still recording cannot be located yet. That is why `-segment_time` is 30s and why a moment that
  finds no segment is retried rather than dropped.

Audio needs `virtual-audio-capturer`, from the screen-capture-recorder installer. It taps whatever
the default output plays without rerouting anything, so the game is still audible. **It must be
installed and verified before the event**; the pre-event checklist below covers it.

## Errors

The event cannot stop for any of this, so every failure degrades and says so.

| Failure                        | Behaviour                                                             |
|--------------------------------|-----------------------------------------------------------------------|
| Audio device will not open     | Restart video-only, badge reads "video only". Never gives up video     |
| ffmpeg dies mid-event          | Badge goes red; recorder retries every 10s. The admin keeps working    |
| `CAPTURE_DIR` unwritable       | Badge red at startup, admin unaffected                                 |
| Under 30GB free               | Warned at startup, recording still starts                             |
| A segment is missing for a moment | Extraction yields nothing; the moment is retried twice, then dropped |
| A clip cut fails               | Segments are kept, badge says which show has no clip                   |
| An extracted frame is unreadable | Same as any ShareX capture: `ReadQueue` records the miss             |

Silent death is the expensive one, which is why liveness is on screen next to the publish badge
rather than in a console nobody is watching.

Segments are kept until the event is over. A clip is a subset of them, so peak disk is roughly
recording plus clips: about 20GB for a four-hour event at 1080p30.

## Tests

TDD, `bun test`, no new dependencies.

| Under test                                                                | How                                     |
|---------------------------------------------------------------------------|-----------------------------------------|
| `moments` derives the three moments and their windows from a parsed log    | Fixture logs, including a timed-out round and a show with no victory |
| `moments` yields nothing twice for the same round                          | Same log parsed twice through the ledger |
| `segments` picks the right file and offset, and reports a gap              | Synthetic `segments.csv` text            |
| `segments` finds nothing for a moment inside the segment still recording    | A csv that stops before the moment       |
| `command` builds record, extract, concat and cut argv                      | Snapshot the argv                        |
| `command` drops the audio input when asked for video-only                  | Assert the argv                          |
| `pick` keeps a toast frame with a trophy and discards the rest             | The existing `samples/` jpgs             |
| `ledger` survives a restart                                                | Write, reload, assert nothing re-extracts |

The runner and recorder are covered only by their argv, which is where the mistakes live. One
manual verification run replaces integration tests over ffmpeg.

## Before the event

1. `winget install`, or run, the screen-capture-recorder installer; confirm
   `ffmpeg -list_devices true -f dshow -i dummy` names `virtual-audio-capturer`.
2. Set `CAPTURE_OUTPUT` to the `ddagrab` index of the monitor Fall Guys is on, and confirm a
   10-second test recording shows the game and not the admin.
3. Confirm the recording has sound.
4. Play one round and confirm a `first` frame lands in the capture panel with a trophy pill.
5. Confirm 30GB+ free on `CAPTURE_DIR`'s drive.

## Out of scope

- Reading anything the OCR does not read today. The screens and regions are unchanged.
- Replacing manual `Alt + Print Screen`, which stays as the backup it is.
- Per-round clips. One mp4 per show.
- Highlights, editing, or uploading anything.
