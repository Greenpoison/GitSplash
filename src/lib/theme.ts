export const THEME_ORDER = ["light", "dim", "dark"] as const;
export type ThemeName = (typeof THEME_ORDER)[number];

/// Cycles light -> dim -> dark -> light. Anything unrecognized (e.g. "system"
/// before it's resolved) falls back to treating the current spot as "light".
export function nextTheme(current: string | undefined): ThemeName {
  const isKnown = (THEME_ORDER as readonly string[]).includes(current ?? "");
  const c = isKnown ? (current as ThemeName) : "light";
  return THEME_ORDER[(THEME_ORDER.indexOf(c) + 1) % THEME_ORDER.length];
}
