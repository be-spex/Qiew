/**
 * The window starts hidden (see the backend's `Viewer::show`). It is shown
 * once the colour scheme is applied and the first document rendered – or it
 * is clear that none comes –, so neither the light default nor the drop
 * target flash up during startup.
 */
import { invoke } from "@tauri-apps/api/core";

let revealed = false;

/** Shows the window; later calls do nothing. */
export function reveal() {
  if (revealed) return;
  revealed = true;
  invoke("show_window").catch(() => {});
}

/**
 * Startup: hides the drop target while the file handed over at startup loads,
 * opens it with `open` and shows the window afterwards.
 */
export async function openInitial(empty: HTMLElement, open: (path: string) => Promise<void>) {
  const path = await invoke<string | null>("initial_file").catch(() => null);
  if (path) {
    empty.hidden = true;
    await open(path);
  }
  reveal();
}
