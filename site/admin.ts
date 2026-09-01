import type { ParsedShow } from "../src/log";
import type { Players, TournamentEvent } from "../src/types";
import {
  defaultMessage,
  draftFor,
  draftFromShow,
  missingFrom,
  namesByPoints,
  suggestShowName,
  syncDraft,
  toShow,
  validate,
  type ShowDraft,
} from "./admin-model";
import type { ShowInOrder } from "./rules";
import { shotsForSlot, type PlacedShot, type Selection } from "../src/screenshots";

interface State {
  players: Players;
  event: TournamentEvent;
  showNames: string[];
  order: ShowInOrder[];
  logPath: string | null;
  shows: ParsedShow[];
  shotDir: string | null;
  shots: PlacedShot[];
}

/** The log only changes when a round ends, so this is about as often as it can pay off. */
const WATCH_MS = 5_000;

let state: State;
let showLinked = false;
let selection: Selection = { slot: "all" };
let selectedShow = 0;
/** The saved show reopened for editing, if any. Otherwise the next unrecorded show is the form. */
let editing: number | null = null;
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

async function save(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
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

/** The log writes Belgian clock times, so captures are shown on the same clock wherever this runs. */
function clock(takenAt: number): string {
  return new Date(takenAt).toLocaleTimeString("nl-BE", {
    timeZone: "Europe/Brussels",
    hour12: false,
  });
}

function shotImages(shots: PlacedShot[]): Node[] {
  if (shots.length === 0) return [el("p", { class: "empty" }, ["No screenshots for this."])];
  return shots.flatMap((shot) => {
    const image = el("img", {
      src: `/api/shot?f=${encodeURIComponent(shot.file)}`,
      alt: shot.file,
    });
    image.addEventListener("click", () => image.classList.toggle("full"));
    return [el("p", { class: "shot-time" }, [clock(shot.takenAt)]), image];
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

function renderShots(): void {
  const target = document.querySelector("#shots")!;
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
      SLOT_LABELS.show,
      shotsForSlot(state.shots, selectedShow, { slot: "show" }),
    ),
    catchAll(
      SLOT_LABELS.unmatched,
      shotsForSlot(state.shots, selectedShow, { slot: "unmatched" }),
    ),
    catchAll("Every screenshot this month", state.shots),
  );
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
    for (const option of ["race", "survival", "final"] as const) {
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

    if (entry.type === "race") {
      cells.push(
        el("label", {}, [
          "first ",
          nameInput(`show:${index}:round:${roundIndex}:first`, entry.first, (value) => {
            entry.first = value;
          }),
        ]),
      );
    }

    cells.push(
      el("span", { class: "hint" }, [
        [
          round.startedAt,
          round.timedOut
            ? "timeout — nobody qualified"
            : `${round.present.length} started, ${round.qualified.length} qualified`,
        ]
          .filter(Boolean)
          .join(" · "),
      ]),
    );

    return selectable(
      el("li", {}, cells),
      index,
      entry.type === "final" ? { slot: "finalists" } : { slot: "round", roundIndex },
    );
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
      await save("/api/event", state.event);
      drafts.delete(index);
      editing = null;
      selectedShow = state.event.shows.length;
      selection = { slot: "all" };
      render();
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
        [parsed.startedAt, parsed.showId, `${parsed.players ?? "?"} players`].filter(Boolean).join(" · "),
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
        el("label", {}, ["Winners"]),
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
          parsed.startedAt,
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
}

function render(): void {
  const focus = currentFocus();
  refreshDatalists();
  renderPlayers();
  renderShows();
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
  let seen = JSON.stringify([state.shows, state.shots]);
  setInterval(async () => {
    let next: State;
    try {
      next = (await (await fetch("/api/state")).json()) as State;
    } catch {
      status("watch-status", "Lost the server. Retrying…", false);
      return;
    }
    status("watch-status", `Watching the log · ${next.shows.length} shows`);
    const signature = JSON.stringify([next.shows, next.shots]);
    if (signature === seen) return;
    seen = signature;
    state.shows = next.shows;
    state.shots = next.shots;
    state.order = next.order;
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
      await save("/api/players", state.players);
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
