import type { ParsedShow } from "../src/log";
import type { Players, TournamentEvent } from "../src/types";
import {
  defaultMessage,
  draftFor,
  draftFromShow,
  missingFrom,
  namesByPoints,
  ROUND_TYPES,
  SCORES_FIRST,
  suggestShowName,
  syncDraft,
  toShow,
  validate,
  type ShowDraft,
} from "./admin-model";
import type { DataProblem } from "../src/data-check";
import type { PublishResult } from "../src/publish";
import type { ShowInOrder } from "./rules";
import { shotsForSlot, type PlacedShot, type Selection, type ShowTimes } from "../src/screenshots";

interface State {
  players: Players;
  event: TournamentEvent;
  showNames: string[];
  order: ShowInOrder[];
  logPath: string | null;
  shows: ParsedShow[];
  times: ShowTimes[];
  shotDir: string | null;
  shots: PlacedShot[];
  /** Whether a save also commits and pushes, which is the flag the server was started with. */
  autoPublish: boolean;
  /** Anything in data/ that would break the published board. Blocks publishing while non-empty. */
  problems: DataProblem[];
}

/** The log only changes when a round ends, so this is about as often as it can pay off. */
const WATCH_MS = 5_000;

let state: State;
let showLinked = false;
let selection: Selection = { slot: "all" };
let selectedShow = 0;
/** The saved show reopened for editing, if any. Otherwise the next unrecorded show is the form. */
let editing: number | null = null;
/** How large each capture is being shown, and which are collapsed, so a rebuild keeps them that way. */
type ShotSize = "thumb" | "fit" | "full";

/**
 * How the panel was left outlives the page: reloading is how the admin recovers from a mistake,
 * and refolding and re-zooming a dozen captures afterwards would make that too expensive to do.
 */
const COLLAPSED_KEY = "fallguys.admin.collapsed";
const SIZES_KEY = "fallguys.admin.sizes";
const SCROLL_KEY = "fallguys.admin.scroll";

function stored<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function remember(key: string, entries: Iterable<unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...entries]));
  } catch {
    // Storage can be off; the panel still behaves for this page.
  }
}

const collapsed = new Set(stored<string>(COLLAPSED_KEY));
const sizes = new Map(stored<[string, ShotSize]>(SIZES_KEY));
const scrolls = new Map(stored<[string, [number, number]]>(SCROLL_KEY));
let panelShowing = "";
/** Set while the panel is being scrolled back to where it was, so that is not read as a move. */
let replacing = false;
const drafts = new Map<number, ShowDraft>();

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

interface Focus {
  key: string;
  start: number | null;
  end: number | null;
}

function currentFocus(): Focus | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || !active.dataset.focusKey) return undefined;
  return { key: active.dataset.focusKey, start: active.selectionStart, end: active.selectionEnd };
}

function restoreFocus(focus: Focus | undefined): void {
  if (!focus) return;
  const input = document.querySelector<HTMLInputElement>(`[data-focus-key="${focus.key}"]`);
  if (!input) return;
  input.focus();
  if (focus.start !== null) input.setSelectionRange(focus.start, focus.end ?? focus.start);
}

function status(id: string, message: string, ok = true): void {
  const node = document.querySelector<HTMLElement>(`#${id}`)!;
  node.textContent = message;
  node.className = ok ? "status ok" : "status bad";
}

async function save(path: string, body: unknown): Promise<PublishResult | undefined> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  const { published } = (await response.json()) as { published?: PublishResult };
  return published;
}

/** Anyone who can be scored, best first: the admin runs the event and is never a name to type. */
function knownNames(): string[] {
  return namesByPoints(state.event, state.players);
}

function refreshDatalists(): void {
  const registered = document.querySelector("#registered")!;
  registered.replaceChildren(...knownNames().map((name) => el("option", { value: name })));
  const showNames = document.querySelector("#show-names")!;
  showNames.replaceChildren(
    ...state.showNames.map((name) => el("option", { value: name })),
  );
}

function renderPlayers(): void {
  const target = document.querySelector("#players")!;
  const all = state.players.players.map((player, index) => ({ player, index }));
  const linked = all.filter(({ player }) => !!player.ingame);
  const toggle = document.querySelector<HTMLButtonElement>("#toggle-linked")!;
  toggle.textContent = showLinked
    ? `Hide ${linked.length} already linked`
    : `Show ${linked.length} already linked`;
  toggle.hidden = linked.length === 0;

  // A row being typed into stays put, or naming a player would pull the field out from under them.
  const editing = Number(currentFocus()?.key.match(/^player:(\d+):/)?.[1] ?? -1);
  const visible = showLinked
    ? all
    : all.filter(({ player, index }) => !player.ingame || index === editing);

  const rows = visible.map(({ player, index }) => {
    const field = (key: "fom" | "ingame" | "discord", placeholder: string) => {
      const input = el("input", {
        type: "text",
        placeholder,
        value: player[key] ?? "",
        ...(key === "ingame" ? { list: "registered" } : {}),
      });
      input.addEventListener("input", () => {
        const value = input.value.trim();
        if (key === "fom") player.fom = value;
        else if (value) player[key] = value;
        else delete player[key];
        if (key === "ingame") refreshDatalists();
      });
      input.dataset.focusKey = `player:${index}:${key}`;
      return input;
    };

    const admin = el("input", { type: "checkbox", title: "Admins are left off the leaderboard" });
    admin.checked = player.admin === true;
    admin.addEventListener("change", () => {
      if (admin.checked) player.admin = true;
      else delete player.admin;
    });

    const remove = el("button", { type: "button", class: "danger" }, ["Delete"]);
    remove.addEventListener("click", () => {
      state.players.players.splice(index, 1);
      renderPlayers();
      refreshDatalists();
    });

    return el("div", { class: "player-row" }, [
      field("fom", "FOM name"),
      field("ingame", "Fall Guys name"),
      field("discord", "Discord"),
      el("label", { class: "admin-flag" }, [admin, " admin"]),
      remove,
    ]);
  });

  target.replaceChildren(
    el("div", { class: "player-row head" }, [
      el("span", {}, ["FOM name"]),
      el("span", {}, ["Fall Guys name"]),
      el("span", {}, ["Discord"]),
      el("span", {}, ["Admin"]),
      el("span", {}, []),
    ]),
    ...(rows.length > 0
      ? rows
      : [el("p", { class: "empty" }, ["Every player has a Fall Guys name."])]),
  );
}

function slotKey(showIndex: number, slot: Selection): string {
  return `${showIndex}:${slot.slot === "round" ? `round:${slot.roundIndex}` : slot.slot}`;
}

/**
 * Clicking or tabbing into a row points the panel at it. Only the class changes, so the form
 * itself is left standing and nothing being typed moves.
 */
function selectable(node: HTMLElement, showIndex: number, slot: Selection): HTMLElement {
  node.dataset.slotKey = slotKey(showIndex, slot);
  const select = () => {
    // Tabbing into a field of the row already on show must not throw away the zoom being read.
    if (slotKey(showIndex, slot) === slotKey(selectedShow, selection)) return;
    selection = slot;
    selectedShow = showIndex;
    renderShots();
    markSelected();
  };
  node.addEventListener("click", select);
  node.addEventListener("focusin", select);
  return node;
}

function markSelected(): void {
  const key = slotKey(selectedShow, selection);
  document.querySelectorAll<HTMLElement>("[data-slot-key]").forEach((node) => {
    node.classList.toggle("selected", node.dataset.slotKey === key);
  });
}

/** The log writes UTC, so every time on the page is put on the event's own clock instead. */
function clock(at: number | undefined): string {
  if (at === undefined) return "";
  return new Date(at).toLocaleTimeString("nl-BE", {
    timeZone: "Europe/Brussels",
    hour12: false,
  });
}

const NEXT_SIZE: Record<ShotSize, ShotSize> = { thumb: "fit", fit: "full", full: "thumb" };

function shotImages(shots: PlacedShot[]): Node[] {
  if (shots.length === 0) return [el("p", { class: "empty" }, ["No screenshots for this."])];

  return shots.flatMap((shot) => {
    const name = shot.file.split("/").pop() ?? shot.file;
    const hide = el("button", { type: "button", class: "link" }, [
      collapsed.has(shot.file) ? "show" : "hide",
    ]);
    hide.addEventListener("click", () => {
      if (collapsed.has(shot.file)) collapsed.delete(shot.file);
      else collapsed.add(shot.file);
      remember(COLLAPSED_KEY, collapsed);
      renderShots();
    });

    const caption = el("p", { class: "shot-time" }, [`${clock(shot.takenAt)} · ${name} `, hide]);
    if (collapsed.has(shot.file)) return [caption];

    const size = sizes.get(shot.file) ?? "thumb";
    const image = el("img", {
      src: `/api/shot?f=${encodeURIComponent(shot.file)}`,
      alt: name,
      class: size,
    });

    image.addEventListener("click", (event) => {
      const before = image.getBoundingClientRect();
      const across = (event.clientX - before.left) / before.width;
      const down = (event.clientY - before.top) / before.height;

      const next = NEXT_SIZE[sizes.get(shot.file) ?? "thumb"];
      sizes.set(shot.file, next);
      remember(SIZES_KEY, sizes);
      image.className = next;
      if (next !== "full") return;

      // The panel is the scroller, so the point clicked is put in the middle of it.
      const panel = image.closest(".shot-panel");
      if (!(panel instanceof HTMLElement)) return;
      const after = image.getBoundingClientRect();
      const frame = panel.getBoundingClientRect();
      panel.scrollLeft += after.left - frame.left + across * after.width - panel.clientWidth / 2;
      panel.scrollTop += after.top - frame.top + down * after.height - panel.clientHeight / 2;
    });

    image.addEventListener("load", () => {
      if (panelShowing === slotKey(selectedShow, selection)) applyScroll();
    });

    return [caption, image];
  });
}

const SLOT_LABELS: Record<Selection["slot"], string> = {
  round: "This round",
  finalists: "Finalists",
  winners: "Winners",
  show: "Between this show's rounds",
  all: "Everything from this show",
  unmatched: "Outside every show",
};

function catchAll(label: string, shots: PlacedShot[]): HTMLElement {
  return el("details", {}, [
    el("summary", {}, [`${label} (${shots.length})`]),
    ...shotImages(shots),
  ]);
}

function applyScroll(): void {
  const target = document.querySelector<HTMLElement>("#shots")!;
  const [left, top] = scrolls.get(panelShowing) ?? [0, 0];
  replacing = true;
  target.scrollLeft = left;
  target.scrollTop = top;
  setTimeout(() => {
    replacing = false;
  }, 0);
}

function renderShots(): void {
  const target = document.querySelector<HTMLElement>("#shots")!;
  const showing = slotKey(selectedShow, selection);

  if (!state.shotDir) {
    target.replaceChildren(
      el("h2", {}, ["Screenshots"]),
      el("p", { class: "empty" }, ["No ShareX folder found. Set SHAREX_DIR and restart."]),
    );
    return;
  }

  target.replaceChildren(
    el("h2", {}, [`Show ${selectedShow + 1} · ${SLOT_LABELS[selection.slot]}`]),
    ...shotImages(shotsForSlot(state.shots, selectedShow, selection)),
    catchAll(
      SLOT_LABELS.unmatched,
      shotsForSlot(state.shots, selectedShow, { slot: "unmatched" }),
    ),
    catchAll("Every screenshot this month", state.shots),
  );

  panelShowing = showing;
  applyScroll();
}

function nameInput(key: string, value: string, onChange: (value: string) => void): HTMLInputElement {
  const input = el("input", { type: "text", list: "registered", value, placeholder: "name" });
  input.dataset.focusKey = key;
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function recordedShowNames(): string[] {
  return state.event.shows.map((show) => show.name);
}

function renderShowForm(parsed: ParsedShow, index: number): HTMLElement {
  const saved = state.event.shows[index];
  const draft =
    drafts.get(index) ??
    (saved
      ? draftFromShow(saved, parsed)
      : draftFor(parsed, suggestShowName(state.order, recordedShowNames())));
  syncDraft(draft, parsed);
  drafts.set(index, draft);

  const name = el("input", {
    type: "text",
    list: "show-names",
    value: draft.name,
    placeholder: "Show name, e.g. Fall Ball Cup",
    class: "show-name",
  });
  name.dataset.focusKey = `show:${index}:name`;
  name.addEventListener("input", () => {
    draft.name = name.value;
  });

  const rounds = parsed.rounds.map((round, roundIndex) => {
    const entry = draft.rounds[roundIndex]!;

    const map = el("input", { type: "text", value: entry.map, class: "map-input" });
    map.dataset.focusKey = `show:${index}:round:${roundIndex}:map`;
    map.addEventListener("input", () => {
      entry.map = map.value;
    });

    const type = el("select");
    for (const option of ROUND_TYPES) {
      const node = el("option", { value: option }, [option]);
      if (entry.type === option) node.setAttribute("selected", "selected");
      type.append(node);
    }
    type.addEventListener("change", () => {
      entry.type = type.value as ShowDraft["rounds"][number]["type"];
      entry.typeEdited = true;
      render();
    });

    const cells: (Node | string)[] = [
      el("span", { class: "round-number" }, [String(roundIndex + 1)]),
      map,
      type,
    ];

    if (SCORES_FIRST.has(entry.type)) {
      cells.push(
        el("label", {}, [
          "first ",
          nameInput(`show:${index}:round:${roundIndex}:first`, entry.first, (value) => {
            entry.first = value;
          }),
        ]),
      );
    }

    const slot: Selection =
      entry.type === "final" ? { slot: "finalists" } : { slot: "round", roundIndex };
    const images = shotsForSlot(state.shots, index, slot).length;

    cells.push(
      el("span", { class: "hint" }, [
        [
          clock(state.times[index]?.rounds[roundIndex]),
          round.timedOut ? "timeout — nobody qualified" : `${round.qualified.length} qualified`,
          images === 0 ? "no images" : `${images} image${images === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" · "),
      ]),
    );

    return selectable(el("li", {}, cells), index, slot);
  });

  const finalists = draft.finalists.map((value, slot) =>
    nameInput(`show:${index}:finalist:${slot}`, value, (next) => {
      draft.finalists[slot] = next;
    }),
  );

  const winners = draft.winners.map((value, slot) =>
    nameInput(`show:${index}:winner:${slot}`, value, (next) => {
      draft.winners[slot] = next;
    }),
  );

  const addWinner = el("button", { type: "button" }, ["+ winner"]);
  addWinner.addEventListener("click", () => {
    draft.winners.push("");
    render();
  });

  const stopEditing = el("button", { type: "button" }, ["Close"]);
  stopEditing.addEventListener("click", () => {
    drafts.delete(index);
    editing = null;
    render();
  });

  const problems = el("ul", { class: "problems" });
  const saveButton = el("button", { type: "button", class: "primary" }, [
    saved ? "Update show" : "Save show",
  ]);
  saveButton.addEventListener("click", async () => {
    const found = validate(draft);
    problems.replaceChildren(...found.map((problem) => el("li", {}, [problem])));
    if (found.length > 0) return;
    const before = [...state.event.shows];
    // Shows are stored by their position in the log, so recording one out of order leaves a gap
    // that has to be filled or every later index would shift.
    for (let earlier = 0; earlier < index; earlier += 1) {
      const parsedEarlier = state.shows[earlier];
      state.event.shows[earlier] ??= parsedEarlier
        ? toShow(draftFor(parsedEarlier))
        : { name: "", rounds: [] };
    }
    state.event.shows[index] = toShow(draft);
    try {
      const published = await save("/api/event", state.event);
      drafts.delete(index);
      editing = null;
      selectedShow = state.event.shows.length;
      selection = { slot: "all" };
      render();
      if (published) status("publish-status", published.message, published.pushed);
    } catch (error) {
      state.event.shows = before;
      problems.replaceChildren(el("li", {}, [`Could not save: ${error}`]));
    }
  });

  return el("div", { class: "show-form" }, [
    el("div", { class: "show-head" }, [
      el("span", { class: "show-number" }, [`Show ${index + 1}`]),
      name,
      el("span", { class: "hint" }, [
        [clock(state.times[index]?.startedAt), parsed.showId, `${parsed.players ?? "?"} players`]
          .filter(Boolean)
          .join(" · "),
      ]),
    ]),
    el("ol", { class: "rounds" }, rounds),
    selectable(
      el("div", { class: "field" }, [
        el("label", {}, [`Finalists (${finalists.length})`]),
        el("div", { class: "names" }, finalists),
      ]),
      index,
      { slot: "finalists" },
    ),
    selectable(
      el("div", { class: "field" }, [
        el("label", {}, [`Winners (${winners.length})`]),
        el("div", { class: "names" }, [...winners, addWinner]),
      ]),
      index,
      { slot: "winners" },
    ),
    problems,
    el("div", { class: "actions" }, [saveButton, ...(saved ? [stopEditing] : [])]),
  ]);
}

function renderShows(): void {
  const target = document.querySelector("#shows")!;

  if (state.shows.length === 0) {
    target.replaceChildren(
      el("p", { class: "empty" }, [
        state.logPath
          ? "No shows in the log yet. Play one, then reload."
          : "No Fall Guys log found. Set FALLGUYS_LOG and restart the server.",
      ]),
    );
    return;
  }

  const open = editing ?? state.event.shows.length;

  const rows = state.shows.map((parsed, index) => {
    if (index === open) return renderShowForm(parsed, index);

    const show = state.event.shows[index];
    const cells: (Node | string)[] = [
      el("span", { class: "show-number" }, [`Show ${index + 1}`]),
      el("span", { class: "map" }, [show?.name || parsed.showId]),
      el("span", { class: "hint" }, [
        [
          clock(state.times[index]?.startedAt),
          `${parsed.rounds.length} rounds`,
          show ? `winner ${show.winners?.join(", ") || "—"}` : "waiting",
        ]
          .filter(Boolean)
          .join(" · "),
      ]),
    ];

    const gaps = missingFrom(show, parsed);
    if (gaps.length > 0) cells.push(el("span", { class: "gaps" }, [`needs ${gaps.join(", ")}`]));

    const edit = el("button", { type: "button", class: "push" }, ["Edit"]);
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      editing = index;
      render();
    });
    cells.push(edit);

    return selectable(
      el("div", { class: show ? "show-done" : "show-done waiting" }, [
        el("div", { class: "show-head" }, cells),
      ]),
      index,
      { slot: "all" },
    );
  });

  target.replaceChildren(...rows);
}

function renderPublish(): void {
  const input = document.querySelector<HTMLInputElement>("#publish-message")!;
  if (!input.dataset.edited) input.value = defaultMessage(state.event);

  document.querySelector("#publish-mode")!.textContent = state.autoPublish
    ? "Every save is committed and pushed. This button is only needed to publish under your own message."
    : "Publishing is off: saves stay on this machine. Restart with bun run live to publish as you go.";
}

/** A field the board cannot read is a blank page for everyone watching, so it is said out loud. */
function renderProblems(): void {
  const banner = document.querySelector<HTMLElement>("#data-problems")!;
  banner.hidden = state.problems.length === 0;
  banner.replaceChildren(
    el("b", {}, [`data/ will not publish — ${state.problems.length} problem${state.problems.length === 1 ? "" : "s"}`]),
    el("ul", {}, state.problems.map(({ file, problem }) => el("li", {}, [`${file}: ${problem}`]))),
  );
}

function render(): void {
  const focus = currentFocus();
  refreshDatalists();
  renderPlayers();
  renderShows();
  renderProblems();
  renderPublish();
  renderShots();
  markSelected();
  restoreFocus(focus);
}

/**
 * Re-reads the log so a round that just ended turns up on its own. Only the log is taken from the
 * poll: players and drafts are whatever is being typed here.
 */
async function watchLog(): Promise<void> {
  let seen = JSON.stringify([state.shows, state.shots, state.times, state.problems]);
  setInterval(async () => {
    let next: State;
    try {
      next = (await (await fetch("/api/state")).json()) as State;
    } catch {
      status("watch-status", "Lost the server. Retrying…", false);
      return;
    }
    status("watch-status", `Watching the log · ${next.shows.length} shows`);
    const signature = JSON.stringify([next.shows, next.shots, next.times, next.problems]);
    if (signature === seen) return;
    seen = signature;
    state.shows = next.shows;
    state.shots = next.shots;
    state.times = next.times;
    state.order = next.order;
    state.problems = next.problems;
    render();
  }, WATCH_MS);
}

async function main(): Promise<void> {
  state = (await (await fetch("/api/state")).json()) as State;
  selectedShow = state.event.shows.length;
  document.querySelector("#log-path")!.textContent = [
    state.logPath ? `Reading ${state.logPath}` : "No Fall Guys log found",
    state.shotDir ? `Screenshots from ${state.shotDir}` : "No ShareX folder found",
  ].join(" · ");

  const panel = document.querySelector<HTMLElement>("#shots")!;
  let pending: ReturnType<typeof setTimeout> | undefined;
  panel.addEventListener(
    "scroll",
    () => {
      if (replacing) return;
      scrolls.set(panelShowing, [panel.scrollLeft, panel.scrollTop]);
      clearTimeout(pending);
      pending = setTimeout(() => remember(SCROLL_KEY, scrolls), 300);
    },
    { passive: true },
  );

  document.querySelector("#add-player")!.addEventListener("click", () => {
    state.players.players.push({ fom: "" });
    renderPlayers();
  });

  document.querySelector("#toggle-linked")!.addEventListener("click", () => {
    showLinked = !showLinked;
    renderPlayers();
  });

  document.querySelector("#save-players")!.addEventListener("click", async () => {
    const missing = state.players.players.filter((player) => !player.fom.trim());
    if (missing.length > 0) {
      status("players-status", "Every player needs a FOM name.", false);
      return;
    }
    try {
      const published = await save("/api/players", state.players);
      if (published) status("publish-status", published.message, published.pushed);
      status("players-status", "Saved.");
    } catch (error) {
      status("players-status", `Could not save: ${error}`, false);
    }
  });

  const message = document.querySelector<HTMLInputElement>("#publish-message")!;
  message.addEventListener("input", () => {
    message.dataset.edited = "yes";
  });

  const publish = document.querySelector<HTMLButtonElement>("#publish")!;
  publish.addEventListener("click", async () => {
    publish.disabled = true;
    status("publish-status", "Publishing…");
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: message.value }),
      });
      const result = (await response.json()) as { pushed: boolean; message: string };
      status("publish-status", result.message, result.pushed);
      if (result.pushed) {
        delete message.dataset.edited;
        renderPublish();
      }
    } catch (error) {
      status("publish-status", `Could not publish: ${error}`, false);
    } finally {
      publish.disabled = false;
    }
  });

  render();
  status("watch-status", `Watching the log · ${state.shows.length} shows`);
  void watchLog();
}

void main();
