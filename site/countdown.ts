import type { TournamentEvent } from "../src/types";

export const DISCORD = "https://discord.gg/J8msxSh6v";

/** The tournament is played in Belgium, so the announced hours are read there wherever the board is. */
const ZONE = "Europe/Brussels";

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function split(ms: number): Remaining {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  };
}

function unit(value: number, label: string): string {
  return `<span class="u"><b>${String(value).padStart(2, "0")}</b><small>${label}</small></span>`;
}

/** Only the digits: the ticker writes these every second, leaving the link beneath them alone. */
export function countdownClock(ms: number): string {
  const left = split(ms);
  const days = left.days > 0 ? unit(left.days, "days") : "";
  return days + unit(left.hours, "hours") + unit(left.minutes, "min") + unit(left.seconds, "sec");
}

function day(start: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);
}

function hour(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

function when(event: TournamentEvent): string {
  const start = new Date(event.startsAt!);
  const span = event.endsAt ? `${hour(start)} – ${hour(new Date(event.endsAt))}` : hour(start);
  return `${day(start)} · ${span}`;
}

/**
 * Empty once the first show is on, whichever comes first: a lobby that opens ahead of its hour
 * would otherwise leave the board counting down to a tournament already being played.
 */
export function renderCountdown(event: TournamentEvent, now: number): string {
  if (!event.startsAt || event.shows.length > 0) return "";
  const left = new Date(event.startsAt).getTime() - now;
  if (left <= 0) return "";

  return `
    <div class="panel countdown" id="countdown" data-starts="${event.startsAt}">
      <div class="lbl">Starts in</div>
      <div class="clock" data-countdown>${countdownClock(left)}</div>
      <div class="when">${when(event)}</div>
      <p class="ask">Join the <a href="${DISCORD}" target="_blank" rel="noopener">Discord</a>
        and add the <b>Fall Guys</b> role.</p>
    </div>`;
}
