/**
 * The CSS color for an account or category color: a swatch name maps to its theme-aware token; a
 * custom `#rrggbb` keeps its hue but has its OKLCH lightness clamped into the theme's readable
 * range (`--custom-l-min`/`--custom-l-max`); no color is the muted text color. An unknown swatch
 * name (from a newer app version) falls back to muted too. Use it as the value of a CSS custom
 * property in an inline style.
 * @param {string | null | undefined} color
 * @returns {string}
 */
export function itemColor(color) {
  if (!color) return 'var(--c-muted)';
  if (color.startsWith('#')) {
    return `oklch(from ${color} clamp(var(--custom-l-min), l, var(--custom-l-max)) c h)`;
  }
  return `var(--sw-${color}, var(--c-muted))`;
}
