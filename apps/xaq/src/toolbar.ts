import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { VIEWS, applyView, effectiveView, onSystemThemeChange, saveView, storedView } from "./views";

const $ = (id: string) => document.getElementById(id)!;

let source = ""; // text of the open document, for "Copy to Clipboard"

function initViewMenu() {
  const btn = $("view-btn");
  const menu = $("view-menu");

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  const markChecked = () => {
    const current = effectiveView();
    menu.querySelectorAll<HTMLElement>("[data-value]").forEach((el) =>
      el.setAttribute("aria-checked", String(el.dataset.value === current)),
    );
  };

  for (const v of VIEWS) {
    const item = document.createElement("button");
    item.className = "tb-item";
    item.setAttribute("role", "menuitemradio");
    item.dataset.value = v.id;
    item.innerHTML = `<span class="swatch" data-view="${v.id}"></span>${v.label}<span class="check">✓</span>`;
    item.addEventListener("click", () => {
      saveView(v.id);
      applyView(v.id);
      markChecked();
      setOpen(false);
    });
    menu.append(item);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden === true);
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !(e.target as Element).closest(".tb-menu")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
  });

  applyView(storedView());
  markChecked();
  onSystemThemeChange(() => {
    if (!storedView()) {
      applyView(null);
      markChecked();
    }
  });
}

function initCopy() {
  const btn = $("copy-btn");
  let timer: number | undefined;
  btn.addEventListener("click", async () => {
    try {
      await writeText(source);
      btn.classList.add("done");
      clearTimeout(timer);
      timer = window.setTimeout(() => btn.classList.remove("done"), 1400);
    } catch (err) {
      console.error("xtaq: copy failed", err);
    }
  });
}

/** Separator line appears only once the document scrolls under the bar. */
function initScrollShadow() {
  const bar = $("toolbar");
  const update = () => bar.classList.toggle("scrolled", window.scrollY > 2);
  window.addEventListener("scroll", update, { passive: true });
  update();
}

/** The back button follows the webview history (see main.ts). */
export function setBackEnabled(enabled: boolean) {
  ($("back-btn") as HTMLButtonElement).disabled = !enabled;
}

export function initToolbar() {
  $("back-btn").addEventListener("click", () => history.back());
  initViewMenu();
  initCopy();
  initScrollShadow();
}

/**
 * Called after each render; `text` is null when no document is open.
 * `foldable` is false for the raw fallback view (nothing to fold).
 */
export function updateToolbar(text: string | null, stats: string, foldable: boolean) {
  source = text ?? "";
  $("doc-tools").hidden = text === null;
  $("fold-tools").hidden = text === null || !foldable;
  $("stats").hidden = text === null;
  $("stats").textContent = stats;
}
