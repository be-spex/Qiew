import { getCurrentWindow } from "@tauri-apps/api/window";

export const VIEWS = [
  { id: "soft-light", label: "Soft Light", dark: false },
  { id: "soft-dark", label: "Soft Dark", dark: true },
  { id: "sepia", label: "Sepia", dark: false },
  { id: "nord", label: "Slate / Nord", dark: true },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];

const STORAGE_KEY = "xaq.view";
const systemDark = matchMedia("(prefers-color-scheme: dark)");

export function storedView(): ViewId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as ViewId) : null;
  } catch {
    return null;
  }
}

export function saveView(id: ViewId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* view still applies for this session */
  }
}

/** The view currently shown: the stored one, else the one matching the system. */
export function effectiveView(): ViewId {
  return storedView() ?? (systemDark.matches ? "soft-dark" : "soft-light");
}

/** Applies a view; without one the CSS follows the system light/dark setting. */
export function applyView(id: ViewId | null) {
  const root = document.documentElement;
  if (id) root.dataset.view = id;
  else delete root.dataset.view;

  const dark = VIEWS.find((v) => v.id === (id ?? effectiveView()))!.dark;
  // Lets the system window frame follow the view where the platform supports it.
  getCurrentWindow().setTheme(dark ? "dark" : "light").catch(() => {});
}

export function onSystemThemeChange(cb: () => void) {
  systemDark.addEventListener("change", cb);
}
