import sangu from "../data/sangu.json";

export const SANGU = "https://sangu.be/fallguys/";

const PAGES = new Set<string>(sangu.levelPages);
const ICONS = new Set<string>(sangu.levelIcons);

/** One glyph for every way out to sangu.be, so a mark beside a map reads as "clips for this". */
export function sanguMark(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="1.5" y="3.5" width="17" height="13" rx="4" stroke="currentColor" stroke-width="2.4"/><path d="M8.4 7.2 13.6 10l-5.2 2.8V7.2Z" fill="currentColor"/></svg>`;
}

function slug(map: string): string {
  return map
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The game's own icon for a level. Sized by `.mapicon`: the files come in ragged dimensions. */
export function levelIcon(map: string): string {
  const name = slug(map);
  if (!ICONS.has(name)) return "";
  return `<img class="mapicon" src="./img/levels/${name}-icon.png" alt="" />`;
}

/** Empty for a map sangu.be carries no clips for, which is a quarter of the ones played. */
export function levelLink(map: string): string {
  const name = slug(map);
  if (!PAGES.has(name)) return "";
  return `<a class="sangu" href="${SANGU}levels/${name}" target="_blank" rel="noopener" title="Clips and shortcuts on sangu.be">${sanguMark()}</a>`;
}
