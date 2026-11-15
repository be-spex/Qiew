import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { showAbout } from "./about";
import { appId } from "./app";
import { initExport } from "./export";
import { docScrollTop, onDocScroll } from "./scroll";
import { VIEWS, applyView, effectiveView, onSystemThemeChange, saveView, storedView } from "./views";

const $ = (id: string) => document.getElementById(id)!;

let source = ""; // text of the open document, for "Copy to Clipboard"

const MENU_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="fill" cx="5.5" cy="12" r="1.6" /><circle class="fill" cx="12" cy="12" r="1.6" /><circle class="fill" cx="18.5" cy="12" r="1.6" /></svg>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * The menu at the right edge of the toolbar, the same in every app: the colour
 * scheme and the About box. An app that takes its colours from the document
 * (`data-no-themes` on the toolbar) has only the About box in it.
 */
function initMenu() {
  const right = document.querySelector("#toolbar .tb-right");
  if (!right) return;
  const themes = !$("toolbar").hasAttribute("data-no-themes");

  const part = el("div", "tb-part tb-menu");
  const btn = el("button", "tb-btn");
  btn.id = "menu-btn";
  btn.title = btn.ariaLabel = themes ? "Color Scheme and About" : "About";
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = MENU_ICON;
  const menu = el("div", "tb-dropdown");
  menu.id = "menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  part.append(btn, menu);
  right.append(part);

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  const markChecked = () => {
    const current = effectiveView();
    menu.querySelectorAll<HTMLElement>("[data-value]").forEach((item) =>
      item.setAttribute("aria-checked", String(item.dataset.value === current)),
    );
  };

  if (themes) {
    menu.append(el("div", "tb-menu-label", "Color Scheme"));
    for (const v of VIEWS) {
      const item = el("button", "tb-item");
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
    menu.append(el("div", "tb-menu-sep"));
  }
  const about = el("button", "tb-item", `About ${document.title}`);
  about.setAttribute("role", "menuitem");
  about.addEventListener("click", () => {
    setOpen(false);
    showAbout();
  });
  menu.append(about);

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

  if (!themes) return;
  applyView(storedView());
  markChecked();
  onSystemThemeChange(() => {
    if (!storedView()) {
      applyView(null);
      markChecked();
    }
  });
}

/** Shows the button's check mark for a moment (copied, saved). */
export function flashDone(btn: HTMLElement) {
  btn.classList.add("done");
  clearTimeout(Number(btn.dataset.doneTimer));
  btn.dataset.doneTimer = String(window.setTimeout(() => btn.classList.remove("done"), 1400));
}

function initCopy() {
  const btn = $("copy-btn");
  btn.addEventListener("click", async () => {
    try {
      await writeText(source);
      flashDone(btn);
    } catch (err) {
      console.error(`${appId()}: copy failed`, err);
    }
  });
}

/** Separator line appears only once the document scrolls under the bar. */
function initScrollShadow() {
  const bar = $("toolbar");
  const update = () => bar.classList.toggle("scrolled", docScrollTop() > 2);
  onDocScroll(update);
  update();
}

export function initToolbar() {
  initCopy();
  initScrollShadow();
  initExport();
  initMenu();
}

/**
 * Called after each render; `text` (what "Copy" hands out) is null when no
 * document is open. `foldable` is false where there is nothing to fold (raw
 * fallback view, apps without folding).
 */
export function updateToolbar(text: string | null, stats: string, foldable = false) {
  source = text ?? "";
  $("doc-tools").hidden = text === null;
  document.querySelectorAll<HTMLElement>(".needs-doc").forEach((el) => (el.hidden = text === null));
  const foldTools = document.getElementById("fold-tools");
  if (foldTools) foldTools.hidden = text === null || !foldable;
  $("stats").hidden = text === null;
  $("stats").textContent = stats;
}
