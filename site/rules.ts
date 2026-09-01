import { escapeHtml } from "./render";

export interface ShowInOrder {
  position: number;
  show: string;
  tier: string;
  /** Player counts the game allows for this show. */
  min: number;
  max: number;
}

function cells(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.startsWith("|") && line.endsWith("|");
}

function isDivider(line: string): boolean {
  return isTableRow(line) && cells(line).every((cell) => /^-+$/.test(cell));
}

function renderTable(rows: string[]): string {
  const [header, ...body] = rows.filter((row) => !isDivider(row)).map(cells);
  const head = header!.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const lines = body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="doc"><thead><tr>${head}</tr></thead><tbody>${lines}</tbody></table>`;
}

/** Renders the subset of Markdown `docs/rules.md` uses: sections, paragraphs and tables. */
export function renderMarkdown(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let table: string[] = [];

  const flush = (): void => {
    if (paragraph.length > 0) {
      out.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
    if (table.length > 0) {
      out.push(renderTable(table));
      table = [];
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
    } else if (isTableRow(line)) {
      if (paragraph.length > 0) flush();
      table.push(line);
    } else if (line.startsWith("## ")) {
      flush();
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      flush();
    } else {
      if (table.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return out.join("\n");
}

export function parseShowOrder(markdown: string): ShowInOrder[] {
  const rows = markdown.split("\n").map((line) => line.trim());
  const start = rows.findIndex(
    (line) => isTableRow(line) && cells(line).join("|") === "#|Show|Tier|Min|Max",
  );
  if (start === -1) return [];

  const shows: ShowInOrder[] = [];
  for (const line of rows.slice(start + 1)) {
    if (!isTableRow(line)) break;
    if (isDivider(line)) continue;
    const [position, show, tier, min, max] = cells(line);
    shows.push({
      position: Number(position),
      show: show!,
      tier: tier!,
      min: Number(min),
      max: Number(max),
    });
  }
  return shows;
}

export function renderShowOrder(shows: ShowInOrder[], currentIndex = -1): string {
  const rows = shows
    .map((show, index) => {
      const state = index < currentIndex ? "o done" : index === currentIndex ? "o now" : "o";
      const label = index < currentIndex ? "Played" : index === currentIndex ? "Playing now" : "";
      return `
      <div class="${state}">
        <span class="n">${show.position}</span>
        <span class="nm">${escapeHtml(show.show)} <span class="tag ${show.tier.toLowerCase()}">${escapeHtml(show.tier)}</span></span>
        <span class="limits">${show.min}\u2013${show.max} players</span>
        <span class="state">${label}</span>
      </div>`;
    })
    .join("");

  return `<div class="orderlist">${rows}</div>`;
}
