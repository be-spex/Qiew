import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { VIEWS, applyView, effectiveView, onSystemThemeChange, saveView, storedView } from "./views";

const $ = (id: string) => document.getElementById(id)!;

let source = ""; // Markdown of the open document, for "Copy to Clipboard"

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
      console.error("marq: copy failed", err);
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

const fmt = new Intl.NumberFormat("en");
const plural = (n: number, word: string) => `${fmt.format(n)} ${word}${n === 1 ? "" : "s"}`;

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
  initViewMenu();
  initCopy();
  initScrollShadow();
}

/** Called after each render; `null` when no document is open. */
export function updateToolbar(markdown: string | null, rendered: HTMLElement) {
  source = markdown ?? "";
  $("doc-tools").hidden = markdown === null;
  $("stats").hidden = markdown === null;
  if (markdown !== null) $("stats").textContent = stats(rendered);
}
