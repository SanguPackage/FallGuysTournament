import { playerDetail } from "../src/player-detail";
import type { Players, TournamentEvent } from "../src/types";
import { renderPlayerModal } from "./player-modal";

export interface PlayerDialog {
  /** Redraws whoever is open against fresher data. Does nothing while the dialog is closed. */
  refresh(event: TournamentEvent, players: Players): void;
}

/**
 * The dialog is opened by any `.open-player` on the page — a whole standings row and every
 * badge on the dashboard and results. They are redrawn on every poll, so the listener is on the
 * document rather than on any of them.
 */
export function attachPlayerDialog(): PlayerDialog | undefined {
  const dialog = document.querySelector<HTMLDialogElement>("#player");
  const body = document.querySelector<HTMLElement>("#player-body");
  if (!dialog || !body) return undefined;

  let open: string | undefined;
  let latest: { event: TournamentEvent; players: Players } | undefined;

  const draw = (): boolean => {
    if (open === undefined || !latest) return false;
    const detail = playerDetail(latest.event, latest.players, open);
    if (!detail) return false;
    body.innerHTML = renderPlayerModal(detail);
    return true;
  };

  // Nothing drawn, nothing opened: a click that beats the first poll home, or a name the
  // leaderboard does not carry, would otherwise put an empty panel on the screen.
  document.addEventListener("click", (click) => {
    const opener = (click.target as HTMLElement | null)?.closest<HTMLElement>(".open-player");
    if (!opener?.dataset.player) return;
    open = opener.dataset.player;
    if (draw()) dialog.showModal();
    else open = undefined;
  });

  dialog.addEventListener("close", () => {
    open = undefined;
  });

  // A click that lands on the dialog itself landed on the backdrop: its own content is a child.
  dialog.addEventListener("click", (click) => {
    const target = click.target as HTMLElement;
    if (target === dialog || target.hasAttribute("data-close-player")) dialog.close();
  });

  return {
    refresh(event, players) {
      latest = { event, players };
      draw();
    },
  };
}
