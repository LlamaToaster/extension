// Popup / side panel colour theme: night (dark, the default) or day (light).
// Kept in the extension's localStorage (popup and panel share it) so it can be
// read synchronously before the first paint: chrome.storage is async and
// would flash the other theme.

export type Theme = "light" | "dark";
export const THEME_KEY = "lt-theme";

export function readTheme(): Theme {
  try {
    if (localStorage.getItem(THEME_KEY) === "light") return "light";
  } catch {
    // storage blocked: the default
  }
  return "dark";
}

export function saveTheme(theme: Theme) {
  try {
    if (theme === "dark") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // not remembered; still applied for this view
  }
}

/** Sets data-theme="light" on <html>; dark is the stylesheet's default. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
}
