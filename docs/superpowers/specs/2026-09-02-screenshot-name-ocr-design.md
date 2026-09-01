# Reading names off the captures

The admin already files every ShareX capture under the round it was taken in. It cannot read
them. Every name still has to be typed off the screen by hand, during the event, while the next
show is starting.

This reads the names out of the captures and drops them into the empty fields.

## What it reads

Four screens name people. Three of them are worth reading.

| Screen             | Names                         | Fills                     |
|--------------------|-------------------------------|---------------------------|
| Qualification grid | everyone who got through      | `finalists`               |
| Winner screen      | the winner                    | `winners`                 |
| Qualified toast    | who crossed, trophy marks 1st | `rounds[n].first`         |

The lobby's **View Names** screen is deliberately not read. Its nametags are anchored to beans in
3D, so there is no fixed region to crop, and in a full lobby they overlap into pileups that no
amount of preprocessing recovers. The qualification grid after round 1 names the same people
cleanly.

### Qualification grid

An 8×4 board of cards at `435,225 → 1492,801` in a 1920×1080 frame, row pitch 144. A card is
green when its player got through, magenta when they went out, blue when the slot is empty. The
name sits in a 15px band directly above its card, right-aligned to a crown badge on the card's
right edge.

Cards are classified by the fraction of green pixels over the card's inner area. Measured on the
two samples this separates without ambiguity — green cards score 0.26–0.67, every other card
scores 0.00 — and the green count matched the board's own total exactly on both (5 and 15).

That count is the checksum, not the `N QUALIFIED!` banner. The banner OCRs unreliably: it read
`15 QUALIFIED!` correctly but `5 QUALIFIED!` as `SS QUALIFIED!`.

### Winner screen

One nameplate at `855,915 → 1115,959`, white text on the player's own banner art.

### Qualified toast

A right-aligned column of pills from about `1640,285`, each `[platform icon] Name [icon]`. A gold
trophy marks the player who finished first; a blue flag marks everyone else. Pill order does not
track finish order — in the Airtime sample the trophy pill sits *below* the flag pill — so the
icon is the signal and position is ignored.

## How a name is read

Preprocessing matters more than the OCR engine.

**Isolate on the minimum channel.** These names are white text with a dark outline, drawn over
green cards, blue frames, magenta cards and open sky within a single strip. A luma threshold
cannot separate them; `min(R,G,B) > 190` can, because white is the only thing high in all three
channels.

**Upscale 6×** before recognition. The name band is 15px tall, well under what Tesseract handles.

## Matching is closed-set

Every tournament player is registered, so the roster is not a spelling aid applied after the
fact — it is the answer key. The name on the screen is known in advance to be one of about
twenty-one strings. That turns reading into choosing, and choosing is a far easier problem.

This only works if the text is segmented **before** matching. Asking "which roster names appear
somewhere in this strip?" tests each name on its own, so `Crissti_14` and `Crissti_41` both match
the same blurry token and both get accepted. Measured that way, a roster carrying realistic
near-misses produced three false positives at every useful threshold.

So each green card is cropped separately — its band ends at the crown badge on the card's right
edge — and yields exactly one token. Each token is then assigned exactly one roster name:

1. Normalise both sides: drop every separator, since `_` reads as a space and carries no signal,
   and fold `0/o 1/l 5/s 8/b 6/g 2/z` together.
2. Rank the roster by edit distance relative to the longer string.
3. Accept the nearest only if it is within **0.45** *and* beats the runner-up by **0.08**.
4. A roster name already assigned to another card on the same board is not offered again — nobody
   qualifies twice.

Now the two Crisstis compete for one token and only one can win.

### What it scores

On the 5-qualified frame, against three rosters of increasing cruelty:

| Roster                                                   | Correct | Declined | Wrong |
|----------------------------------------------------------|---------|----------|-------|
| The real names                                            | 5 of 5  | 0        | **0** |
| Plus near-misses (`Crissti_41`, `pdalhome2`, `DarkRazor`) | 5 of 5  | 0        | **0** |
| Plus one-character twins (`Darkwin068`, `BigMooseLip`)     | 4 of 5  | 1        | **0** |

Nothing is ever confidently wrong. The margin rule converts what would have been a wrong answer
into a declined one, which is the trade worth making for a field that fills itself in.

Unknown names decline rather than being forced onto a roster entry: the two Greek names in the
samples score 0.69–0.77, well past the cutoff. The English-only model cannot read them at all.

**Two players whose in-game names differ by one character cannot be told apart.** The matcher
declines both rather than guessing. Worth a look over `players.json` once everyone has reported.

### When nothing matches

The cleaned token is used as-is. Registration is the rule at the tournament but not when testing
solo, and a name typed from a real capture beats an empty field. The admin is shown whether a
field was matched to the roster or taken as read, so the two are never confused.

## Where it fits

```
listShots ──► placeShots ──► readShot ──► matchRoster ──► autofill ──► admin fields
 (exists)      (exists)       (new)         (new)          (new)
```

`placeShots` already tags a capture taken after the round before the final with `namesFinalists`,
so a grid read knows whether it means finalists or just a mid-show qualification. A recognizer
therefore does not name a slot. It returns a typed read, and a separate pure function maps read
plus placement onto a slot.

### Modules

| Module                   | Pure | Does                                                        |
|--------------------------|------|-------------------------------------------------------------|
| `src/ocr/geometry.ts`    | yes  | Regions as fractions of frame size; `toPixels`               |
| `src/ocr/recognizers.ts` | yes  | The registry: probes that identify a screen, where names sit |
| `src/ocr/grid.ts`        | yes  | Classifies the 8×4 board from a pixel reader                 |
| `src/ocr/match.ts`       | yes  | Assigns each token one roster name, or declines              |
| `src/ocr/autofill.ts`    | yes  | Read + placement → which empty slot it fills                 |
| `src/ocr/image.ts`       | no   | Decode, crop, upscale, min-channel threshold                 |
| `src/ocr/read.ts`        | no   | Runs the registry over one capture                           |
| `src/ocr/cache.ts`       | no   | Keyed on file + mtime, persisted                             |

Everything that decides anything is pure and takes a pixel reader, so the tests run against real
sample frames without a browser or a live game.

### Identifying a screen

Colour probes at fixed fractional points, checked before any OCR runs:

- **grid** — the bright green banner across the top, plus the blue board frame.
- **winner** — the rainbow stripe in the top-left corner and the nameplate pill below centre.
- **toast** — the pale pill background in the top-right column.

A capture that matches nothing is skipped and cached as "no screen", so it is never retried.

### Serving it

OCR takes 1–2s per capture. `/api/state` is polled every few seconds and must not block, so
`scripts/serve.ts` gains a single background worker: after `placeShots`, any capture with no cache
entry is queued, and `/api/state` returns `reads` **from cache only**. A read that is not ready
yet is simply absent, and turns up on a later poll — which is the existing auto-update path, not a
new one.

The cache is keyed on file path plus mtime and persisted to a gitignored `.ocr-cache/`, so
restarting the server mid-event does not re-read every capture. Tesseract's model file is cached
in the same folder rather than under `node_modules`, so `bun install` does not throw it away.
First run needs network; nothing after that does.

### Filling the fields

```ts
autofill(event, shots, reads, players): Patch[]
```

A patch is emitted only for a slot that is **currently empty**. Anything already typed — or filled
earlier by OCR and since corrected — is never touched again, even if a later capture of the same
round disagrees. Nothing fights the cursor mid-event.

`admin.ts` applies patches after each poll and badges each filled field with a link to the capture
it came from, so a wrong read can be traced back to the screen it was read off.

## What this does not do

- No non-Latin names.
- No **View Names** lobby screen.
- No resolution other than the game's own window. Regions are fractional and scale, but the
  probes and the 15px name band were measured at 1920×1080 and are not verified below it.
- Nothing is written to `event.json` by OCR directly. Patches land in the admin's draft, and
  saving stays a deliberate act.

## Tests

Five frames are committed under `src/ocr/samples/`, as quality-70 JPEG at the game's own
1920×1080 — around 150KB each, and lossy enough to be a fair test of what OCR sees:

| Frame            | Screen              | Expected                    |
|------------------|---------------------|-----------------------------|
| `grid-15.jpg`    | qualification grid  | 15 green cards              |
| `grid-5.jpg`     | qualification grid  | 5 green cards               |
| `winner.jpg`     | winner screen       | `Diego_9942`                |
| `toast.jpg`      | qualified toast     | `Serxav_9` first            |
| `lobby.jpg`      | View Names lobby    | no screen, no names         |

The toast frame is the pause menu with the toast column still showing top-right, which is how the
capture was actually taken. `lobby.jpg` is the negative case and the important one: it is covered
in legible names and must still yield nothing.

Against them:

- each frame is identified as the right screen, and `lobby.jpg` as none;
- the grid classifies 5 of 5 and 15 of 15 green cards;
- the winner frame yields `Diego_9942`;
- the toast frame yields `Serxav_9` as first, from the trophy rather than pill order;
- matching assigns 5 of 5 names on `grid-5.jpg` with a near-miss roster, and nothing wrong;
- a one-character twin in the roster makes both names decline rather than guess;
- an unregistered name falls through to its cleaned token;
- `autofill` leaves a non-empty slot alone.
