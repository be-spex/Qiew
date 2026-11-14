/**
 * Export, the same in every app: if the backend offers one (it registers an
 * `Exporter`, see `qiew_frame::export`), a button joins the document tools.
 * The backend shows the save dialog and writes the file.
 */
import { invoke } from "@tauri-apps/api/core";
import { appId } from "./app";

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon-copy"><path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5" /><path d="M5 15.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" /></svg><svg viewBox="0 0 24 24" aria-hidden="true" class="icon-done"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>`;

let content: (() => string) | null = null;
let available = true;
let button: HTMLButtonElement | null = null;

/**
 * For apps whose export is made from what the frontend shows (a rendered
 * view, say): `provider` is called on export and its result handed to the
 * backend's exporter.
 */
export function setExportContent(provider: () => string) {
  content = provider;
}

/** For documents that cannot be exported (a file shown as written because it cannot be parsed). */
export function setExportAvailable(yes: boolean) {
  available = yes;
  if (button) button.disabled = !yes;
}

/** Adds the export button to the document tools, if the app has an export. */
export async function initExport() {
  const tools = document.getElementById("doc-tools");
  const info = await invoke<{ label: string } | null>("export_info").catch(() => null);
  if (!tools || !info) return;

  const btn = (button = document.createElement("button"));
  btn.disabled = !available;
  btn.className = "tb-btn";
  btn.id = "export-btn";
  btn.title = `Export as ${info.label}…`;
  btn.ariaLabel = `Export as ${info.label}`;
  btn.innerHTML = ICON;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const saved = await invoke<string | null>("export_file", { content: content?.() ?? null });
      if (saved) {
        btn.classList.add("done");
        setTimeout(() => btn.classList.remove("done"), 1400);
      }
    } catch (err) {
      console.error(`${appId()}: export failed`, err); // the backend has told the user
    } finally {
      btn.disabled = !available;
    }
  });
  tools.append(btn);
}
