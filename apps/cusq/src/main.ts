/*
 * Cusq – a CSV or TSV file as a tidy table: sortable and filterable columns and a full text
 * search over all cells. Only the rows in view exist in the DOM, so large files stay quick.
 * Toolbar, colour schemes and the About box come from the frame.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { setExportContent } from "@qiew/frame/export";
import { plural } from "@qiew/frame/fragment";
import { onRevealRequest, revealLaunchLine } from "@qiew/frame/launch";
import { openInitial } from "@qiew/frame/reveal";
import { initToolbar, updateToolbar } from "@qiew/frame/toolbar";
import { DELIMITER_NAMES, type Delimiter, type Kind, compare, dateFormat, detectDelimiter, filterOf, kindOf, numberFormat, parse, toCsv } from "./table";

setApp("cusq");
initToolbar();

interface Doc {
  path: string;
  content: string;
}

const ROW = 27; // px, fixed: the virtual scroll depends on it
const OVERSCAN = 12;
const DROP_HERE = "Drop CSV or TSV File Here";

const empty = document.getElementById("empty")!;
const grid = document.getElementById("grid")!;
const headerBtn = document.getElementById("header-btn")!;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const searchBox = document.getElementById("search")!;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const searchCount = document.getElementById("search-count")!;
const searchBtn = document.getElementById("search-btn")!;

let current: Doc | null = null;
let delimiter: Delimiter = ",";
let hasHeader = true;
let names: string[] = [];
let body: string[][] = [];
let columns = 0;
let kinds: Kind[] = [];
let shown: (((v: string) => string) | null)[] = []; // how a column's values are displayed, if not as written
let widths: number[] = [];

let sort: { col: number; desc: boolean } | null = null;
let filterText: string[] = [];
let query = "";
let view: number[] = []; // indices into `body`, in display order
let selected = -1; // index into `body`
let marked = -1; // row to show as the --line target
let tbody: HTMLTableSectionElement | null = null;

// ---- data --------------------------------------------------------------------------------

const letters = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

function load(doc: Doc, keepState: boolean) {
  const before = { columns, hasHeader };
  const name = doc.path.split("/").pop() ?? "";
  delimiter = detectDelimiter(doc.content, name);
  const rows = parse(doc.content, delimiter);
  columns = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const padded = rows.map((r) => (r.length < columns ? [...r, ...Array<string>(columns - r.length).fill("")] : r));
  names = hasHeader && padded.length > 0 ? padded[0] : Array.from({ length: columns }, (_, i) => letters(i));
  body = hasHeader ? padded.slice(1) : padded;

  kinds = Array.from({ length: columns }, (_, c) => kindOf(body.map((r) => r[c])));
  shown = kinds.map((k, c) => {
    const values = body.map((r) => r[c]);
    return k === "number" ? numberFormat(values, names[c]) : k === "date" ? dateFormat(values) : null;
  });
  widths = Array.from({ length: columns }, (_, c) => {
    let chars = names[c].length + 3;
    for (const r of body.slice(0, 300)) chars = Math.max(chars, (shown[c]?.(r[c]) ?? r[c]).length);
    return Math.min(380, Math.max(72, Math.round(chars * 7.3 + 26)));
  });

  if (!(keepState && before.columns === columns && before.hasHeader === hasHeader)) {
    sort = null;
    filterText = Array<string>(columns).fill("");
    selected = -1;
  }
}

function applyView() {
  const tests = filterText.map((t, c) => filterOf(t, kinds[c]));
  const active = tests
    .map((t, c) => [t, c] as const)
    .filter((x): x is readonly [(v: string) => boolean, number] => typeof x[0] === "function");
  const needle = query.toLowerCase();
  let indices: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const row = body[i];
    if (active.some(([test, c]) => !test(row[c]))) continue;
    if (needle && !row.some((v) => v.toLowerCase().includes(needle))) continue;
    indices.push(i);
  }
  if (sort) {
    const { col, desc } = sort;
    indices = indices.map((i) => [i, body[i][col]] as const).sort((a, b) => compare(a[1], b[1], desc, kinds[col]) || a[0] - b[0]).map((x) => x[0]);
  }
  view = indices;
  // Invalid filters are marked, not applied.
  grid.querySelectorAll<HTMLInputElement>("tr.filters input").forEach((input, c) => {
    input.classList.toggle("bad", tests[c] === null);
  });
  clearBtn.disabled = !(sort || query || filterText.some((t) => t.trim() !== ""));
  searchCount.textContent = query ? `${plural(view.length, "row")}` : "";
  searchBox.classList.toggle("no-results", query !== "" && view.length === 0);
  stats();
}

function stats() {
  if (!current) return;
  const rows = view.length === body.length ? plural(body.length, "Row") : `${new Intl.NumberFormat().format(view.length)} of ${plural(body.length, "Row")}`;
  updateToolbar(current.content, `${rows} · ${plural(columns, "Column")} · ${DELIMITER_NAMES[delimiter]}`);
}

// ---- drawing -----------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function mark(value: string): string {
  if (!query) return esc(value);
  const lower = value.toLowerCase();
  const needle = query.toLowerCase();
  let out = "";
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    out += `${esc(value.slice(from, at))}<mark>${esc(value.slice(at, at + needle.length))}</mark>`;
    from = at + needle.length;
  }
  return out + esc(value.slice(from));
}

/** Builds the table's head (names and filters); the rows come from `draw`. */
function build() {
  const arrow = (c: number) => (sort?.col === c ? (sort.desc ? "▼" : "▲") : "");
  const cols = `<colgroup><col style="width:56px">${widths.map((w) => `<col style="width:${w}px">`).join("")}</colgroup>`;
  const head =
    `<thead><tr class="names"><th class="n">#</th>${names
      .map((n, c) => `<th data-col="${c}" class="${kinds[c] === "number" ? "num" : ""}"><span class="arrow">${arrow(c)}</span>${esc(n)}</th>`)
      .join("")}</tr>` +
    `<tr class="filters"><th class="n"></th>${names
      .map((_, c) => `<th><input data-col="${c}" value="${esc(filterText[c])}" placeholder="Filter" spellcheck="false" autocomplete="off" aria-label="Filter column ${c + 1}"></input></th>`)
      .join("")}</tr></thead>`;
  const total = 56 + widths.reduce((a, b) => a + b, 0);
  grid.innerHTML = `<table style="width:${total}px">${cols}${head}<tbody></tbody></table>`;
  tbody = grid.querySelector("tbody");
}

function draw() {
  if (!tbody) return;
  const first = Math.max(0, Math.floor(grid.scrollTop / ROW) - OVERSCAN);
  const last = Math.min(view.length, first + Math.ceil(grid.clientHeight / ROW) + 2 * OVERSCAN);
  let html = first > 0 ? `<tr class="spacer"><td colspan="${columns + 1}" style="height:${first * ROW}px"></td></tr>` : "";
  for (let v = first; v < last; v++) {
    const i = view[v];
    const row = body[i];
    const cls = [i === selected ? "sel" : "", i === marked ? "launch-line" : ""].filter(Boolean).join(" ");
    html += `<tr data-i="${i}"${cls ? ` class="${cls}"` : ""}><td class="n">${i + 1}</td>`;
    for (let c = 0; c < columns; c++) {
      const text = shown[c] && row[c] !== "" ? shown[c]!(row[c]) : null;
      html += `<td${kinds[c] === "number" ? ' class="num"' : ""}>${text !== null && text !== row[c] ? esc(text) : mark(row[c])}</td>`;
    }
    html += "</tr>";
  }
  if (last < view.length) {
    html += `<tr class="spacer"><td colspan="${columns + 1}" style="height:${(view.length - last) * ROW}px"></td></tr>`;
  }
  tbody.innerHTML = html;
}

let frame = 0;
const redraw = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
};
grid.addEventListener("scroll", redraw, { passive: true });
addEventListener("resize", redraw);

function refresh(resetScroll = false) {
  applyView();
  if (resetScroll) grid.scrollTop = 0;
  draw();
}

function render(keepState: boolean) {
  if (!current) return;
  const scroll = keepState ? grid.scrollTop : 0;
  load(current, keepState);
  empty.hidden = true;
  grid.hidden = false;
  build();
  applyView();
  grid.scrollTop = scroll;
  draw();
  setExportContent(() => toCsv([...(hasHeader ? [names] : []), ...view.map((i) => body[i])], delimiter === ";" ? ";" : ","));
}

function showMessage(text: string, isError = false) {
  grid.hidden = true;
  updateToolbar(null, "");
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

// ---- interaction -------------------------------------------------------------------------

grid.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const th = target.closest<HTMLElement>("tr.names th[data-col]");
  if (th) {
    const col = Number(th.dataset.col);
    // ascending, descending, back to file order
    sort = sort?.col !== col ? { col, desc: false } : sort.desc ? null : { col, desc: true };
    build();
    refresh(true);
    return;
  }
  const tr = target.closest<HTMLElement>("tbody tr[data-i]");
  if (tr) {
    const i = Number(tr.dataset.i);
    selected = selected === i ? -1 : i;
    draw();
  }
});

// A cell that does not fit shows its whole content as a tooltip – only then, since a tooltip
// lies over the rows below it.
grid.addEventListener("mouseover", (e) => {
  const cell = (e.target as HTMLElement).closest<HTMLElement>("tbody td:not(.n), tr.names th[data-col]");
  if (!cell) return;
  if (cell.scrollWidth > cell.clientWidth) cell.title = cell.textContent ?? "";
  else cell.removeAttribute("title");
});

grid.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (!input.matches("tr.filters input")) return;
  filterText[Number(input.dataset.col)] = input.value;
  clearTimeout(filterTimer);
  filterTimer = window.setTimeout(() => refresh(true), 120);
});
let filterTimer: number | undefined;

clearBtn.addEventListener("click", () => {
  sort = null;
  filterText = Array<string>(columns).fill("");
  query = "";
  searchInput.value = "";
  build();
  refresh(true);
});

headerBtn.addEventListener("click", () => {
  hasHeader = !hasHeader;
  headerBtn.setAttribute("aria-pressed", String(hasHeader));
  render(false);
});

function openSearch() {
  if (!current) return;
  searchBox.hidden = false;
  document.body.classList.add("searching");
  searchInput.focus();
  searchInput.select();
}

function closeSearch() {
  if (searchBox.hidden) return;
  searchBox.hidden = true;
  document.body.classList.remove("searching");
  if (query) {
    query = "";
    searchInput.value = "";
    refresh(true);
  }
}

let searchTimer: number | undefined;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    query = searchInput.value;
    refresh(true);
  }, 120);
});
searchBtn.addEventListener("click", () => (searchBox.hidden ? openSearch() : closeSearch()));
document.getElementById("search-close")!.addEventListener("click", closeSearch);
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openSearch();
  } else if (e.key === "Escape" && !searchBox.hidden) {
    closeSearch();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected >= 0 && !getSelection()?.toString()) {
    const inField = document.activeElement instanceof HTMLInputElement;
    if (!inField) {
      e.preventDefault();
      writeText(body[selected].join("\t")).catch(() => {});
    }
  }
});

// ---- opening -----------------------------------------------------------------------------

function reveal(line: number) {
  const record = line - 1 - (hasHeader ? 1 : 0);
  const at = view.indexOf(record);
  if (at < 0) return;
  marked = record;
  grid.scrollTop = Math.max(0, at * ROW - grid.clientHeight / 4);
  draw();
  setTimeout(() => {
    marked = -1;
    draw();
  }, 2200);
}
onRevealRequest(reveal);

async function open(path: string) {
  try {
    current = await invoke<Doc>("open_file", { path });
    if (current.content.trim() === "") {
      showMessage("Die Datei ist leer.");
      return;
    }
    render(false);
    // The window is as wide as the table (unless --geometry says otherwise; the backend knows).
    const width = 56 + widths.reduce((a, b) => a + b, 0) + 18;
    await invoke("fit_width", { width: Math.max(width, 480) }).catch(() => {});
    revealLaunchLine(reveal);
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
}

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    document.body.classList.add("dragging");
    empty.textContent = DROP_HERE;
    empty.classList.remove("error");
    empty.hidden = false;
  } else {
    document.body.classList.remove("dragging");
    empty.hidden = current !== null;
    if (p.type === "drop" && p.paths[0]) open(p.paths[0]);
  }
});

listen<Doc>("file-changed", ({ payload }) => {
  if (current && payload.path === current.path) {
    current = payload;
    render(true);
  }
});
listen<string>("open-file", ({ payload }) => open(payload));

openInitial(empty, open);
