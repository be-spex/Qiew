/**
 * Outline: the headings of the document as a table of contents in a side panel.
 * A click jumps to the section; the section being read is marked while scrolling.
 */
import { docScrollTop, onDocScroll } from "@qiew/frame/scroll";

const PIN_KEY = "marq.outline.pinned"; // pinned: the page makes room and the panel stays open; otherwise it floats
const $ = (id: string) => document.getElementById(id)!;

let heads: { el: HTMLElement; link: HTMLAnchorElement }[] = [];
let active = -1;
/** A clicked entry stays marked until the reader scrolls on their own: near the end of the
 document a heading cannot always reach the top. */
let chosen = -1;

const isOpen = () => document.body.classList.contains("outline-open");

const isPinned = () => document.body.classList.contains("outline-pinned");

function setOpen(open: boolean) {
  document.body.classList.toggle("outline-open", open && heads.length > 0);
  $("outline-btn").setAttribute("aria-expanded", String(isOpen()));
  // A pinned panel is open at the next start, a floating one is not.
  if (isPinned()) localStorage.setItem(PIN_KEY, open ? "open" : "closed");
  markActive();
}

function setPinned(pinned: boolean) {
  document.body.classList.toggle("outline-pinned", pinned);
  const btn = $("outline-pin");
  btn.setAttribute("aria-pressed", String(pinned));
  btn.title = pinned ? "Unpin (panel floats over the page)" : "Pin (panel makes room beside the page)";
  if (pinned) localStorage.setItem(PIN_KEY, isOpen() ? "open" : "closed");
  else localStorage.removeItem(PIN_KEY);
}

/** The last heading that has reached the top edge, below the toolbar. */
function markActive() {
  if (!isOpen() || !heads.length) return;
  // Headings are put 52px from the top when jumped to (scroll-margin-top), so allow for that.
  const top = $("toolbar").getBoundingClientRect().bottom + 16;
  let idx = 0;
  heads.forEach((h, i) => {
    if (h.el.getBoundingClientRect().top <= top) idx = i;
  });
  const atEnd = Math.ceil(window.innerHeight + docScrollTop()) >= document.documentElement.scrollHeight - 1;
  if (atEnd && docScrollTop() > 0) idx = heads.length - 1;
  if (chosen >= 0) idx = chosen;
  if (idx === active) return;
  active = idx;
  heads.forEach((h, i) => {
    h.link.classList.toggle("active", i === idx);
    if (i === idx) h.link.setAttribute("aria-current", "location");
    else h.link.removeAttribute("aria-current");
  });
  heads[idx].link.scrollIntoView({ block: "nearest" });
}

/** Called after each render (and with `null` when no document is open). */
export function updateOutline(rendered: HTMLElement | null) {
  const list = $("outline-list");
  list.textContent = "";
  heads = [];
  active = -1;
  chosen = -1;
  const els = rendered ? [...rendered.querySelectorAll<HTMLElement>("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]")] : [];
  const min = Math.min(...els.map((e) => Number(e.tagName[1])));
  for (const el of els) {
    const a = document.createElement("a");
    a.href = `#${el.id}`;
    a.textContent = el.textContent ?? "";
    a.title = a.textContent;
    a.style.paddingLeft = `${12 + (Number(el.tagName[1]) - min) * 14}px`;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      chosen = heads.findIndex((h) => h.el === el);
      el.scrollIntoView();
      markActive();
      if (!isPinned() && matchMedia("(max-width: 800px)").matches) setOpen(false);
    });
    list.append(a);
    heads.push({ el, link: a });
  }
  ($("outline-btn") as HTMLButtonElement).disabled = !heads.length;
  setOpen(isOpen() || (isPinned() && localStorage.getItem(PIN_KEY) === "open"));
}

export function initOutline() {
  $("outline-btn").addEventListener("click", () => setOpen(!isOpen()));
  $("outline-close").addEventListener("click", () => setOpen(false));
  $("outline-pin").addEventListener("click", () => setPinned(!isPinned()));
  setPinned(localStorage.getItem(PIN_KEY) !== null);
  // A floating panel closes when the page is clicked or on Escape.
  document.addEventListener("mousedown", (e) => {
    if (isOpen() && !isPinned() && !(e.target as Element).closest("#outline, #outline-btn")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen() && !isPinned() && $("search").hidden) setOpen(false);
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      if (heads.length) setOpen(!isOpen());
    }
  });
  onDocScroll(markActive);
  // The reader takes over: wheel, touch, keys, or the scroll bar.
  const release = () => {
    chosen = -1;
  };
  for (const ev of ["wheel", "touchmove"]) window.addEventListener(ev, release, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) release();
  });
  document.addEventListener("mousedown", (e) => {
    if (e.target === document.documentElement) release();
  });
  window.addEventListener("resize", markActive);
}
