# Tournament site redesign — design

The leaderboard site is a single dark table. During the LAN it will be on a second screen
next to the lobby, so it has to be readable across the room, look like it belongs to both
Fall Guys and FOM, and update itself.

## Pages

Five pages, one shared shell.

| Page       | File             | Data | Content                                                              |
|------------|------------------|------|----------------------------------------------------------------------|
| Dashboard  | `index.html`     | live | Status ribbon, top-three podium, rest of the field as a card grid     |
| Standings  | `standings.html` | live | Every player as a wide row with races/finals/wins and penalties       |
| Results    | `results.html`   | live | One panel per show, newest first, round by round                      |
| Rules      | `rules.html`     | —    | `docs/rules.md` rendered                                              |
| Show order | `shows.html`     | live | The ten shows, marked played / playing now / upcoming                 |

Nav is a row of pills in the shared shell; the current page is the solid yellow one. Every
page carries the footer. The data pages carry the live badge; only the rules never change.

## Look

Fall Guys first, FOM second. A fixed candy gradient (purple base, pink/cyan/yellow radial
bleeds) with two blurred blobs. Podium and nav pills are thick-outlined with a hard offset
shadow, the Fall Guys house style. Titan One for the page title, Bebas Neue for section
headings and the FOM badge, Baloo 2 for body — Bebas is what fom.be itself uses, and the
`#1f587f` FOM blue is the badge colour.

Podium beans are CSS shapes. Real art can replace them later by dropping an `<img>` into
each slot.

## Status ribbon

Derived from what the admin has already recorded — no new CLI command, nothing extra to
type mid-tournament.

| Cell        | Source                                                       |
|-------------|--------------------------------------------------------------|
| Now playing | Last show in `event.shows`, and its position in the order     |
| Round N     | `rounds.length + 1` of that show                              |
| Last round  | Last recorded round's map, type and winner                    |
| Up next     | The next show in the order after the current one              |

A show that has `winners` is finished, so the ribbon reads "Waiting for the next show" and
Round is omitted. Before the first show it reads "Not started yet".

There is no "still in" count: the number of players alive mid-round is not recorded and
guessing it would be wrong on screen.

## Auto-reload

`site/main.ts` polls `event.json` and `players.json` every 15 seconds with `cache: "no-store"`
and a cache-busting query, compares the raw text against the previous poll, and re-renders
only the data region when it changed. Scroll position and the page shell are untouched.

Players whose points went up in that poll get a green ring for six seconds so anyone
watching the screen sees what changed without reading the whole board.

A failed poll leaves the last good render on screen and marks the badge stale; the next
successful poll clears it.

## Modules

| Module            | Responsibility                                                          |
|-------------------|-------------------------------------------------------------------------|
| `src/live.ts`     | Derive the status ribbon's facts from an event and the show order        |
| `site/page.ts`    | The shell: head, header, nav, footer                                     |
| `site/render.ts`  | Podium, field grid, standings rows — pure `LeaderboardRow[]` → HTML      |
| `site/results.ts` | Show panels — pure `Show[]` → HTML, replacing `site/shows.ts`            |
| `site/rules.ts`   | Markdown subset and the show order table, now with per-show state        |
| `site/main.ts`    | Fetch, poll, diff, mount into the page's data region                     |

`scripts/build.ts` writes the five HTML files, the stylesheet, the three data files, and
`order.json` — the show order parsed out of `docs/rules.md`, which the dashboard needs for
"up next" and the show order page needs for its state.

## Testing

Every render function is pure and tested on its HTML output, as the existing ones are.
`src/live.ts` is tested against events with no shows, a show in progress, a finished show,
and the final show in the order. Polling itself is not tested.
