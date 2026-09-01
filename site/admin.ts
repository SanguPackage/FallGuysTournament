import type { ParsedShow } from "../src/log";
import type { Players, TournamentEvent } from "../src/types";
import { draftFor, toShow, validate, type ShowDraft } from "./admin-model";

interface State {
  players: Players;
  event: TournamentEvent;
  showNames: string[];
  logPath: string | null;
  shows: ParsedShow[];
}

let state: State;
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

function registeredNames(): string[] {
  return state.players.players.map((player) => player.ingame).filter((n): n is string => !!n);
}

function refreshDatalists(): void {
  const registered = document.querySelector("#registered")!;
  registered.replaceChildren(
    ...registeredNames().map((name) => el("option", { value: name })),
  );
  const showNames = document.querySelector("#show-names")!;
  showNames.replaceChildren(
    ...state.showNames.map((name) => el("option", { value: name })),
  );
}

function renderPlayers(): void {
  const target = document.querySelector("#players")!;
  const rows = state.players.players.map((player, index) => {
    const field = (key: "fom" | "ingame" | "discord", placeholder: string) => {
      const input = el("input", { type: "text", placeholder, value: player[key] ?? "" });
      input.addEventListener("input", () => {
        const value = input.value.trim();
        if (key === "fom") player.fom = value;
        else if (value) player[key] = value;
        else delete player[key];
        if (key === "ingame") refreshDatalists();
      });
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
    ...rows,
  );
}

function nameInput(value: string, onChange: (value: string) => void): HTMLInputElement {
  const input = el("input", { type: "text", list: "registered", value, placeholder: "name" });
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function renderShowForm(parsed: ParsedShow, index: number): HTMLElement {
  const draft = drafts.get(index) ?? draftFor(parsed);
  drafts.set(index, draft);

  const name = el("input", {
    type: "text",
    list: "show-names",
    value: draft.name,
    placeholder: "Show name, e.g. Fall Ball Cup",
    class: "show-name",
  });
  name.addEventListener("input", () => {
    draft.name = name.value;
  });

  const rounds = parsed.rounds.map((round, roundIndex) => {
    const entry = draft.rounds[roundIndex]!;

    const map = el("input", { type: "text", value: entry.map, class: "map-input" });
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
          nameInput(entry.first, (value) => {
            entry.first = value;
          }),
        ]),
      );
    }

    cells.push(
      el("span", { class: "hint" }, [
        round.timedOut
          ? "timeout — nobody qualified"
          : `${round.present.length} started, ${round.qualified.length} qualified`,
      ]),
    );

    return el("li", {}, cells);
  });

  const finalists = draft.finalists.map((value, slot) =>
    nameInput(value, (next) => {
      draft.finalists[slot] = next;
    }),
  );

  const winners = draft.winners.map((value, slot) =>
    nameInput(value, (next) => {
      draft.winners[slot] = next;
    }),
  );

  const addWinner = el("button", { type: "button" }, ["+ winner"]);
  addWinner.addEventListener("click", () => {
    draft.winners.push("");
    render();
  });

  const problems = el("ul", { class: "problems" });
  const saveButton = el("button", { type: "button", class: "primary" }, ["Save show"]);
  saveButton.addEventListener("click", async () => {
    const found = validate(draft, registeredNames());
    problems.replaceChildren(...found.map((problem) => el("li", {}, [problem])));
    if (found.length > 0) return;
    state.event.shows.push(toShow(draft));
    try {
      await save("/api/event", state.event);
      drafts.delete(index);
      render();
    } catch (error) {
      state.event.shows.pop();
      problems.replaceChildren(el("li", {}, [`Could not save: ${error}`]));
    }
  });

  return el("div", { class: "show-form" }, [
    el("div", { class: "show-head" }, [
      el("span", { class: "show-number" }, [`Show ${index + 1}`]),
      name,
      el("span", { class: "hint" }, [`${parsed.showId} · ${parsed.players ?? "?"} players`]),
    ]),
    el("ol", { class: "rounds" }, rounds),
    el("div", { class: "field" }, [
      el("label", {}, [`Finalists (${finalists.length})`]),
      el("div", { class: "names" }, finalists),
    ]),
    el("div", { class: "field" }, [
      el("label", {}, ["Winners"]),
      el("div", { class: "names" }, [...winners, addWinner]),
    ]),
    problems,
    el("div", { class: "actions" }, [saveButton]),
  ]);
}

function renderShows(): void {
  const target = document.querySelector("#shows")!;
  const recorded = state.event.shows.length;

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

  const done = state.event.shows.map((show, index) =>
    el("div", { class: "show-done" }, [
      el("span", { class: "show-number" }, [`Show ${index + 1}`]),
      el("span", { class: "map" }, [show.name]),
      el("span", { class: "hint" }, [
        `${show.rounds.length} rounds · winner ${show.winners?.join(", ") || "—"}`,
      ]),
    ]),
  );

  const next = state.shows[recorded];
  const later = state.shows.slice(recorded + 1).map((parsed, offset) =>
    el("div", { class: "show-done waiting" }, [
      el("span", { class: "show-number" }, [`Show ${recorded + offset + 2}`]),
      el("span", { class: "map" }, [parsed.showId]),
      el("span", { class: "hint" }, [`${parsed.rounds.length} rounds · waiting`]),
    ]),
  );

  target.replaceChildren(
    ...done,
    ...(next ? [renderShowForm(next, recorded)] : []),
    ...later,
  );
}

function render(): void {
  refreshDatalists();
  renderPlayers();
  renderShows();
}

async function main(): Promise<void> {
  state = (await (await fetch("/api/state")).json()) as State;
  document.querySelector("#log-path")!.textContent = state.logPath
    ? `Reading ${state.logPath}`
    : "No Fall Guys log found";

  document.querySelector("#add-player")!.addEventListener("click", () => {
    state.players.players.push({ fom: "" });
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

  render();
}

void main();
