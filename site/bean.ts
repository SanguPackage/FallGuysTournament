/** One per bean, so a player is recognisable by colour alone across shows. */
export const BEAN_COLOURS = [
  "#ff4fa3",
  "#35d6f0",
  "#6ee787",
  "#ffb347",
  "#7b6bff",
  "#ff6b6b",
  "#4dd4a8",
  "#c77dff",
  "#f4d35e",
  "#5aa9ff",
];

/** FNV-1a: any change of name must land somewhere else in the palette, not one colour along. */
function hash(name: string): number {
  let value = 2166136261;
  for (let index = 0; index < name.length; index++) {
    value ^= name.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function beanColour(name: string): string {
  return BEAN_COLOURS[hash(name) % BEAN_COLOURS.length]!;
}

/**
 * Colours for beans that stand side by side. Ten colours and three names collide often enough to
 * see, and two identical beans on one podium read as a bug, so a taken colour steps to the next
 * free one. Past the palette everything is taken and the hashed colour stands.
 */
export function beanColours(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const start = hash(name) % BEAN_COLOURS.length;
    for (let step = 0; step < BEAN_COLOURS.length; step++) {
      const colour = BEAN_COLOURS[(start + step) % BEAN_COLOURS.length]!;
      if (!taken.has(colour)) {
        taken.add(colour);
        return colour;
      }
    }
    return BEAN_COLOURS[start]!;
  });
}

/** The viewBox lets a caller size the bean from CSS alone. */
export function beanSvg(colour: string): string {
  return `<svg class="bean" viewBox="0 0 120 150" style="color:${colour}" aria-hidden="true">
      <ellipse class="limb" cx="40" cy="139" rx="17" ry="9"/>
      <ellipse class="limb" cx="80" cy="139" rx="17" ry="9"/>
      <path class="limb" d="M22 70 q-16 12 -12 32 q10 8 18-2"/>
      <path class="limb" d="M98 70 q16 12 12 32 q-10 8 -18-2"/>
      <path class="body" d="M60 8 C90 8 105 30 105 64 C105 106 92 132 60 132 C28 132 15 106 15 64 C15 30 30 8 60 8Z"/>
      <ellipse class="eye" cx="45" cy="59" rx="12" ry="15"/>
      <ellipse class="eye" cx="75" cy="59" rx="12" ry="15"/>
      <circle class="pupil" cx="47" cy="61" r="5.5"/>
      <circle class="pupil" cx="77" cy="61" r="5.5"/>
      <path class="shine" d="M32 25 q14-12 30-10 q-18 4 -26 16Z"/>
    </svg>`;
}
