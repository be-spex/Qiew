import { plural } from "@qiew/frame/fragment";
import { initToolbar as initFrameToolbar, updateToolbar as updateFrameToolbar } from "@qiew/frame/toolbar";

const $ = (id: string) => document.getElementById(id)!;

/** Counts what the reader sees (rendered text), not Markdown syntax. */
function stats(rendered: HTMLElement): string {
  const text = rendered.innerText.replace(/\n+/g, " ").trim();
  const chars = [...text].length;
  const words = text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return `${plural(chars, "Character")}, ${plural(words, "Word")}`;
}

/** The back button follows the webview history (see main.ts). */
export function setBackEnabled(enabled: boolean) {
  ($("back-btn") as HTMLButtonElement).disabled = !enabled;
}

export function initToolbar() {
  $("back-btn").addEventListener("click", () => history.back());
  initFrameToolbar();
}

/** Called after each render; `null` when no document is open. */
export function updateToolbar(markdown: string | null, rendered: HTMLElement) {
  updateFrameToolbar(markdown, markdown === null ? "" : stats(rendered));
}
