/**
 * In-document search. Matches are painted with the CSS Custom Highlight API,
 * so the rendered document is never modified – it survives live reloads and
 * finds matches across the highlighting spans. Matches inside folded nodes
 * unfold those nodes (like find-in-page does for <details>).
 *
 * Navigation is relative to what the reader sees: if the active match is
 * still on screen, ↑/↓ step from it; once the reader has scrolled away, they
 * jump to the first match below (or last above) the visible area's edge.
 */
import { unfoldAround } from "./fold";
import { appId } from "./app";
import { scrollDocBy } from "./scroll";

const $ = (id: string) => document.getElementById(id)!;
const DEBOUNCE_MS = 80;
/** Shorter terms match nearly everything and are not searched. */
const MIN_CHARS = 2;

let article: HTMLElement;
let box: HTMLElement;
let input: HTMLInputElement;
let count: HTMLElement;

let matches: Range[] = [];
let active = -1;
let timer: number | undefined;

const supported = typeof CSS !== "undefined" && "highlights" in CSS;

// One long-lived Highlight per style, changed in place. WebKit does not
// repaint the old ranges when a registry entry is replaced by a new
// Highlight object, which left stale marks behind while typing; clear()
// and add() on the same object do invalidate the affected text.
const allMarks = supported ? new Highlight() : null;
const activeMark = supported ? new Highlight() : null;
if (allMarks && activeMark) {
  CSS.highlights.set("search", allMarks);
  CSS.highlights.set("search-active", activeMark);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds all case-insensitive occurrences of `term` in the article's text. */
function findRanges(term: string): Range[] {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    starts.push(text.length);
    text += n.nodeValue;
  }

  // Index of the text node that contains global offset `pos`.
  const nodeAt = (pos: number) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const ranges: Range[] = [];
  const re = new RegExp(escapeRegExp(term), "giu");
  for (const m of text.matchAll(re)) {
    const s = m.index!, e = s + m[0].length;
    const a = nodeAt(s), b = nodeAt(e - 1);
    const r = document.createRange();
    r.setStart(nodes[a], s - starts[a]);
    r.setEnd(nodes[b], e - starts[b]);
    ranges.push(r);
  }
  return ranges;
}

function paint() {
  if (!allMarks || !activeMark) return;
  allMarks.clear();
  for (const r of matches) allMarks.add(r);
  activeMark.clear();
  if (active >= 0) activeMark.add(matches[active]);
}

/** The current search term, or "" while it is too short to search. */
function term() {
  return [...input.value].length >= MIN_CHARS ? input.value : "";
}

function updateCount() {
  const n = matches.length;
  const searching = term() !== "";
  count.textContent = !searching ? "" : n === 0 ? "No results" : `${active + 1} / ${n}`;
  box.classList.toggle("no-results", searching && n === 0);
}

/** Top/bottom of the area not covered by the sticky toolbar. */
function viewport() {
  const top = $("toolbar").getBoundingClientRect().bottom;
  return { top, bottom: window.innerHeight };
}

function isVisible(r: Range) {
  const rect = r.getBoundingClientRect();
  const v = viewport();
  return rect.top >= v.top && rect.bottom <= v.bottom;
}

function reveal(r: Range) {
  if (isVisible(r)) return;
  const rect = r.getBoundingClientRect();
  const v = viewport();
  // Place the match at about a third of the visible height.
  scrollDocBy(rect.top - v.top - (v.bottom - v.top) / 3);
}

function step(dir: 1 | -1) {
  const n = matches.length;
  if (!n) return;
  if (active >= 0 && isVisible(matches[active])) {
    active = (active + dir + n) % n;
  } else {
    const v = viewport();
    if (dir === 1) {
      const i = matches.findIndex((r) => r.getBoundingClientRect().top >= v.top);
      active = i >= 0 ? i : 0;
    } else {
      let i = n - 1;
      while (i >= 0 && matches[i].getBoundingClientRect().bottom > v.bottom) i--;
      active = i >= 0 ? i : n - 1;
    }
  }
  reveal(matches[active]);
  paint();
  updateCount();
}

/** Re-runs the search, e.g. after typing or after the document re-rendered. */
function run() {
  const t = term();
  matches = t ? findRanges(t) : [];
  for (const r of matches) unfoldAround(r.startContainer);
  active = -1;
  if (matches.length) {
    // Start at the first match from the visible area on, like a browser does.
    step(1);
  } else {
    paint();
    updateCount();
  }
}

function clear() {
  matches = [];
  active = -1;
  paint();
}

export function openSearch() {
  if (article.hidden) return;
  document.body.classList.add("searching");
  box.hidden = false;
  input.focus();
  input.select();
  if (term()) run();
}

export function closeSearch() {
  if (box.hidden) return;
  box.hidden = true;
  document.body.classList.remove("searching");
  clear();
  input.blur();
}

/** Call after every render so highlights follow the new document. */
export function refreshSearch() {
  if (!box.hidden && term()) run();
}

export function initSearch(doc: HTMLElement) {
  article = doc;
  box = $("search");
  input = $("search-input") as HTMLInputElement;
  count = $("search-count");
  if (!supported) console.warn(`${appId()}: CSS Custom Highlight API unavailable, search cannot highlight`);

  $("search-btn").addEventListener("click", () => (box.hidden ? openSearch() : closeSearch()));
  $("search-next").addEventListener("click", () => step(1));
  $("search-prev").addEventListener("click", () => step(-1));
  $("search-close").addEventListener("click", closeSearch);

  input.addEventListener("input", () => {
    clearTimeout(timer);
    // A too-short term clears the marks at once; typing is debounced.
    if (!term()) run();
    else timer = window.setTimeout(run, DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openSearch();
    } else if (e.key === "F3" && !box.hidden) {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape" && !box.hidden && document.activeElement !== input) {
      closeSearch();
    }
  });
}
