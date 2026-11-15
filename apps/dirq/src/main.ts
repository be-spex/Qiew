/*
 * Dirq – a diff or patch file the way a diff tool shows it: the old and the new text side by
 * side (or unified), changed words marked, the files on the left, and the patch's own data
 * – subject, author, message – in a header. Toolbar, search, colour schemes and the About box
 * come from the frame.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { setExportContent } from "@qiew/frame/export";
import { plural } from "@qiew/frame/fragment";
import { onRevealRequest, revealElement, revealLaunchLine, revealTextLine } from "@qiew/frame/launch";
import { openInitial } from "@qiew/frame/reveal";
import { closeSearch, initSearch, refreshSearch } from "@qiew/frame/search";
import { initToolbar, updateToolbar } from "@qiew/frame/toolbar";
import { type DiffLine, type FileDiff, type Hunk, type Patch, type Span, describeInfo, inlineDiff, parsePatch } from "./diff";

setApp("dirq");
initToolbar();

interface Doc {
  path: string;
  content: string;
}

const DROP_HERE = "Drop Diff or Patch File Here";
const HEAD = 41 + 36; // toolbar and the sticky file header
const BIG = 4000; // lines; a file this long starts collapsed

const empty = document.getElementById("empty")!;
const layout = document.getElementById("doc")!;
const filesEl = document.getElementById("files")!;
const content = document.getElementById("content")!;
const $btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

// ---- settings (remembered) ---------------------------------------------------------------

const store = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(`dirq.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(`dirq.${key}`, value);
  } catch {
    /* applies for this session */
  }
};
let unified = store("mode", "split") === "unified";
let ignoreWs = store("ws", "0") === "1";
let sideOpen = store("side", "1") === "1";

let current: Doc | null = null;
let patch: Patch | null = null;
const collapsed = new Set<string>(); // by file key
let seen = ""; // the patch the collapsed set belongs to
let firstShown = true;

initSearch(content);

// ---- building the markup -----------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const key = (f: FileDiff) => f.newPath || f.oldPath;

/** Text with the changed parts marked. */
function code(text: string, spans: Span[] | undefined): string {
  if (!spans?.length) return esc(text) || "​";
  let out = "";
  let at = 0;
  for (const s of spans) {
    out += esc(text.slice(at, s.from)) + `<span class="w">${esc(text.slice(s.from, s.to))}</span>`;
    at = s.to;
  }
  return out + esc(text.slice(at));
}

const eol = (l: DiffLine) => (l.noEol ? `<span class="eol">no newline at end of file</span>` : "");

interface Row {
  old?: DiffLine;
  new?: DiffLine;
  oldSpans?: Span[];
  newSpans?: Span[];
  changed: boolean;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** The lines of a hunk as rows: removed and added lines of one change next to each other. */
function rowsOf(hunk: Hunk): Row[] {
  const rows: Row[] = [];
  const ls = hunk.lines;
  for (let i = 0; i < ls.length; ) {
    if (ls[i].type === " ") {
      rows.push({ old: ls[i], new: ls[i], changed: false });
      i++;
      continue;
    }
    const del: DiffLine[] = [];
    const add: DiffLine[] = [];
    while (i < ls.length && ls[i].type === "-") del.push(ls[i++]);
    while (i < ls.length && ls[i].type === "+") add.push(ls[i++]);
    for (let k = 0; k < Math.max(del.length, add.length); k++) {
      const o = del[k];
      const n = add[k];
      if (o && n) {
        if (ignoreWs && squash(o.text) === squash(n.text)) {
          rows.push({ old: o, new: n, changed: false });
          continue;
        }
        const d = inlineDiff(o.text, n.text);
        rows.push({ old: o, new: n, oldSpans: d?.a, newSpans: d?.b, changed: true });
      } else rows.push({ old: o, new: n, changed: true });
    }
  }
  return rows;
}

function hunkRow(h: Hunk, gap: number, cols: number): string {
  const note = gap > 0 ? `<span class="gap">⋯ ${plural(gap, "unchanged line")}</span>` : "";
  return `<tr class="hunk" data-src="${h.src}"><td colspan="${cols}">${note}${esc(h.header.replace(/ @@.*$/, " @@"))}${h.section ? ` <span class="sec">${esc(h.section)}</span>` : ""}</td></tr>`;
}

function tableOf(f: FileDiff): string {
  const cols = unified ? 3 : 4;
  let html = unified
    ? `<table class="diff unified"><colgroup><col style="width:52px"><col style="width:52px"><col></colgroup><tbody>`
    : `<table class="diff split"><colgroup><col style="width:52px"><col><col style="width:52px"><col></colgroup><tbody>`;
  let prevEnd = 1;
  // Unified: a change shows all removed lines, then all added ones.
  let adds = "";
  for (const h of f.hunks) {
    html += adds + hunkRow(h, h.oldStart - prevEnd, cols);
    adds = "";
    const last = [...h.lines].reverse().find((l) => l.oldNo !== undefined);
    prevEnd = (last?.oldNo ?? h.oldStart - 1) + 1;
    let inRun = false;
    for (const r of rowsOf(h)) {
      const start = r.changed && !inRun;
      inRun = r.changed;
      const cls = start ? ' class="cs"' : "";
      if (unified) {
        if (!r.changed) {
          html += adds;
          adds = "";
          html += `<tr data-src="${r.new!.src}"><td class="no">${r.old!.oldNo}</td><td class="no">${r.new!.newNo}</td><td class="code sign" data-sign=" ">${code(r.new!.text, undefined)}${eol(r.new!)}</td></tr>`;
          continue;
        }
        if (r.old)
          html += `<tr data-src="${r.old.src}"${cls}><td class="no del">${r.old.oldNo}</td><td class="no del"></td><td class="code sign del" data-sign="−">${code(r.old.text, r.oldSpans)}${eol(r.old)}</td></tr>`;
        if (r.new)
          adds += `<tr data-src="${r.new.src}"${r.old ? "" : cls}><td class="no add"></td><td class="no add">${r.new.newNo}</td><td class="code sign add" data-sign="+">${code(r.new.text, r.newSpans)}${eol(r.new)}</td></tr>`;
        // Unified order is all removed, then all added; the pairing above interleaves them, which
        // reads the same for one-line changes and keeps words marked for longer blocks.
      } else {
        const src = Math.min(r.old?.src ?? Infinity, r.new?.src ?? Infinity);
        const o = r.old;
        const n = r.new;
        html +=
          `<tr data-src="${src}"${cls}>` +
          `<td class="no${r.changed && o ? " del" : ""}">${o?.oldNo ?? ""}</td>` +
          `<td class="code${r.changed ? (o ? " del" : " void") : ""}">${o ? code(o.text, r.oldSpans) + eol(o) : ""}</td>` +
          `<td class="no${r.changed && n ? " add" : ""}">${n?.newNo ?? ""}</td>` +
          `<td class="code${r.changed ? (n ? " add" : " void") : ""}">${n ? code(n.text, r.newSpans) + eol(n) : ""}</td></tr>`;
      }
    }
  }
  return html + adds + "</tbody></table>";
}

const STATUS = { modified: "M", added: "A", deleted: "D", renamed: "R", copied: "C" } as const;

/** Directory part dimmed, file name emphasised. */
function pathHtml(path: string, strip = ""): string {
  const shownPath = strip && path.startsWith(strip) ? path.slice(strip.length) : path;
  const at = shownPath.lastIndexOf("/");
  return at < 0 ? `<b>${esc(shownPath)}</b>` : `<i>${esc(shownPath.slice(0, at + 1))}</i><b>${esc(shownPath.slice(at + 1))}</b>`;
}

function fileBody(f: FileDiff): string {
  if (f.binary) return `<div class="note">Binary file – there is no text to compare.</div>`;
  if (f.hunks.length === 0) {
    return `<div class="note">${f.status === "renamed" ? "Renamed without changes." : f.status === "added" ? "Empty file added." : f.status === "deleted" ? "Empty file removed." : "No changes to the content."}</div>`;
  }
  return tableOf(f);
}

function fileHtml(f: FileDiff, index: number, forceOpen = false): string {
  const isCollapsed = !forceOpen && collapsed.has(key(f));
  const where =
    f.status === "renamed" || f.status === "copied"
      ? `${pathHtml(f.oldPath)} <span class="info">→</span> ${pathHtml(f.newPath)}`
      : pathHtml(f.status === "deleted" ? f.oldPath : f.newPath);
  const oldInfo = describeInfo(f.oldInfo);
  const newInfo = describeInfo(f.newInfo);
  const infos = [
    f.status === "renamed" && f.similarity !== undefined ? `${f.similarity}% similar` : "",
    f.modeChange ?? "",
    oldInfo && newInfo && f.status === "modified" ? `${oldInfo} → ${newInfo}` : "",
  ].filter(Boolean);
  return (
    `<section class="file${isCollapsed ? " collapsed" : ""}" data-i="${index}" data-src="${f.src}">` +
    `<header class="file-head"><span class="tw">▼</span><span class="st st-${f.status}">${STATUS[f.status]}</span>` +
    `<span class="path">${where}</span><span class="info">${esc(infos.join(" · "))}</span><span class="grow"></span>` +
    `<span class="cnt"><span class="a">+${f.added}</span> <span class="d">−${f.deleted}</span></span></header>` +
    `<div class="file-body">${isCollapsed ? "" : fileBody(f)}</div></section>`
  );
}

/** The squares next to the totals: how the change splits into added and removed. */
function bar(added: number, deleted: number): string {
  const total = added + deleted;
  if (total === 0) return "";
  const a = Math.round((added / total) * 5);
  return `<span class="bar" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="${i < a ? "a" : "d"}"></i>`).join("")}</span>`;
}

function authorHtml(author: string): string {
  const m = author.match(/^(.*?)\s*<([^>]*)>$/);
  return m && m[1] ? `<b>${esc(m[1].replace(/^"|"$/g, ""))}</b> <span>&lt;${esc(m[2])}&gt;</span>` : `<b>${esc(author)}</b>`;
}

function dateHtml(date: string): string {
  const t = Date.parse(date);
  return Number.isNaN(t) ? esc(date) : esc(new Date(t).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }));
}

const GENERATOR = { git: "Git", idea: "IntelliJ IDEA", svn: "Subversion", plain: "diff" } as const;

function metaHtml(p: Patch, name: string): string {
  const m = p.meta;
  const by = [m.author ? authorHtml(m.author) : "", m.date ? dateHtml(m.date) : "", m.commit ? `<code>${esc(m.commit.slice(0, 8))}</code>` : ""].filter(Boolean);
  const paragraphs = m.message === "" ? "" : m.message.split(/\n{2,}/).map((t) => `<p>${esc(t)}</p>`).join("");
  const long = m.message.split("\n").length > 7;
  return (
    `<section class="meta"><div class="meta-top">${m.tag ? `<span class="chip tag">${esc(m.tag)}</span>` : ""}` +
    `<span class="chip">${GENERATOR[m.generator]}</span></div>` +
    `<h1>${esc(m.subject ?? name)}</h1>` +
    (by.length ? `<div class="byline">${by.join('<span class="sep">·</span>')}</div>` : "") +
    (paragraphs ? `<div class="message${long ? " clamped" : ""}">${paragraphs}</div>${long ? `<button class="more">Show more</button>` : ""}` : "") +
    (m.trailers.length ? `<dl class="trailers">${m.trailers.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "") +
    `<div class="summary"><span>${plural(p.files.length, "file")} changed</span><span><span class="a">+${p.added}</span> <span class="d">−${p.deleted}</span></span>${bar(p.added, p.deleted)}</div></section>`
  );
}

function commonDir(paths: string[]): string {
  if (paths.length < 2) return "";
  const parts = paths[0].split("/").slice(0, -1);
  let n = parts.length;
  for (const p of paths) {
    const q = p.split("/");
    let i = 0;
    while (i < n && i < q.length - 1 && q[i] === parts[i]) i++;
    n = i;
  }
  return n > 0 ? parts.slice(0, n).join("/") + "/" : "";
}

function listHtml(p: Patch): string {
  const strip = commonDir(p.files.map(key));
  return p.files
    .map(
      (f, i) =>
        `<a data-i="${i}"><span class="st st-${f.status}">${STATUS[f.status]}</span>` +
        `<span class="nm"><bdi>${pathHtml(key(f), strip)}</bdi></span>` +
        `<span class="cnt"><span class="a">+${f.added}</span> <span class="d">−${f.deleted}</span></span></a>`,
    )
    .join("");
}

// ---- showing -----------------------------------------------------------------------------

const fileName = (path: string) => path.split("/").pop() ?? path;

function render(keepScroll: boolean) {
  if (!current) return;
  const scroll = keepScroll ? window.scrollY : 0;
  closeSearch();
  patch = parsePatch(current.content);
  if (!patch) {
    showRaw();
    return;
  }
  if (seen !== current.path) {
    seen = current.path;
    collapsed.clear();
    patch.files.forEach((f) => f.hunks.reduce((n, h) => n + h.lines.length, 0) > BIG && collapsed.add(key(f)));
  }
  content.innerHTML = metaHtml(patch, fileName(current.path)) + patch.files.map((f, i) => fileHtml(f, i)).join("");
  filesEl.innerHTML = listHtml(patch);
  empty.hidden = true;
  layout.hidden = false;
  layout.classList.toggle("no-side", !sideOpen || patch.files.length < 2);
  $btn("side-btn").hidden = patch.files.length < 2;
  $btn("side-btn").setAttribute("aria-pressed", String(sideOpen));
  $btn("mode-btn").title = unified ? "Side by side view" : "Unified view";
  $btn("ws-btn").setAttribute("aria-pressed", String(ignoreWs));
  updateToolbar(current.content, `${plural(patch.files.length, "File")} · +${patch.added} −${patch.deleted}`);
  setExportContent(exportHtml);
  window.scrollTo(0, scroll);
  refreshSearch();
  spy();
}

/** Not a patch we understand: the text as it is, so nothing is hidden. */
function showRaw() {
  patch = null;
  content.innerHTML = `<section class="meta"><h1>${esc(fileName(current!.path))}</h1><div class="byline">This does not look like a unified diff, so it is shown as written.</div></section><pre class="plain" id="raw"></pre>`;
  document.getElementById("raw")!.textContent = current!.content;
  filesEl.innerHTML = "";
  empty.hidden = true;
  layout.hidden = false;
  layout.classList.add("no-side");
  $btn("side-btn").hidden = true;
  updateToolbar(current!.content, plural(current!.content.split("\n").length, "Line"));
  setExportContent(exportHtml);
}

function showMessage(text: string, isError = false) {
  layout.hidden = true;
  $btn("side-btn").hidden = true;
  updateToolbar(null, "");
  closeSearch();
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

async function open(path: string) {
  try {
    current = await invoke<Doc>("open_file", { path });
    render(false);
    if (firstShown) {
      firstShown = false;
      // Room for two columns and the file list (--geometry wins; the backend knows).
      await invoke("fit_width", { width: unified ? 1080 : 1500 }).catch(() => {});
    }
    revealLaunchLine(reveal);
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
}

// ---- interaction -------------------------------------------------------------------------

function toggleFile(section: HTMLElement) {
  if (!patch) return;
  const f = patch.files[Number(section.dataset.i)];
  const body = section.querySelector(".file-body")!;
  const open = section.classList.contains("collapsed");
  section.classList.toggle("collapsed", !open);
  if (open) {
    collapsed.delete(key(f));
    body.innerHTML = fileBody(f);
  } else {
    collapsed.add(key(f));
    body.innerHTML = "";
  }
}

content.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.matches(".more")) {
    const message = content.querySelector(".message")!;
    const open = message.classList.toggle("clamped");
    target.textContent = open ? "Show more" : "Show less";
    return;
  }
  const head = target.closest<HTMLElement>(".file-head");
  if (head && !getSelection()?.toString()) toggleFile(head.parentElement!);
});

filesEl.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("a[data-i]");
  if (!a) return;
  const section = content.querySelector<HTMLElement>(`.file[data-i="${a.dataset.i}"]`)!;
  if (section.classList.contains("collapsed")) toggleFile(section);
  window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - 41 - 4 });
  // Near the end of the patch the file cannot reach the top of the window: show which one it is.
  const head = section.querySelector(".file-head")!;
  head.classList.add("launch-line");
  setTimeout(() => head.classList.remove("launch-line"), 900);
});

function setUnified(yes: boolean) {
  unified = yes;
  save("mode", yes ? "unified" : "split");
  render(true);
}
$btn("mode-btn").addEventListener("click", () => setUnified(!unified));
$btn("ws-btn").addEventListener("click", () => {
  ignoreWs = !ignoreWs;
  save("ws", ignoreWs ? "1" : "0");
  render(true);
});
$btn("side-btn").addEventListener("click", () => {
  sideOpen = !sideOpen;
  save("side", sideOpen ? "1" : "0");
  render(true);
});

// ---- navigating the changes --------------------------------------------------------------

const changes = () => [...content.querySelectorAll<HTMLElement>("tr.cs")];

function jump(dir: 1 | -1) {
  const list = changes();
  if (!list.length) return;
  const edge = HEAD + 6;
  let target: HTMLElement | undefined;
  if (dir === 1) target = list.find((el) => el.getBoundingClientRect().top > edge + 8);
  else target = [...list].reverse().find((el) => el.getBoundingClientRect().top < edge - 8);
  target ??= dir === 1 ? list[0] : list[list.length - 1]; // round the corner
  const box = target.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + box.top - edge - (window.innerHeight - edge) / 4 });
  target.classList.add("launch-line");
  setTimeout(() => target!.classList.remove("launch-line"), 900);
}
$btn("next-btn").addEventListener("click", () => jump(1));
$btn("prev-btn").addEventListener("click", () => jump(-1));
document.addEventListener("keydown", (e) => {
  if (e.key === "F7") {
    e.preventDefault();
    jump(e.shiftKey ? -1 : 1);
  }
});

/** Which change and which file the view is at. */
let spyFrame = 0;
function spy() {
  cancelAnimationFrame(spyFrame);
  spyFrame = requestAnimationFrame(() => {
    const edge = HEAD + 6;
    const list = changes();
    const at = list.findIndex((el) => el.getBoundingClientRect().top >= edge - 8);
    document.getElementById("chg-count")!.textContent = list.length ? `${at < 0 ? list.length : at + 1} / ${list.length}` : "";
    let active = -1;
    content.querySelectorAll<HTMLElement>(".file").forEach((s, i) => {
      if (s.getBoundingClientRect().top <= edge) active = i;
    });
    filesEl.querySelectorAll("a").forEach((a, i) => a.classList.toggle("active", i === Math.max(active, 0)));
  });
}
addEventListener("scroll", spy, { passive: true });

// ---- --line and export -------------------------------------------------------------------

/** Line n of the patch file: the row that shows it. */
function reveal(line: number) {
  if (!patch) {
    revealTextLine(content, line);
    return;
  }
  const at = patch.files.findIndex((f) => line >= f.src && line <= f.srcEnd);
  if (at < 0) return; // in the header: nothing to point at
  const section = content.querySelector<HTMLElement>(`.file[data-i="${at}"]`)!;
  if (section.classList.contains("collapsed")) toggleFile(section);
  let best: HTMLElement | null = null;
  section.querySelectorAll<HTMLElement>("tr[data-src]").forEach((tr) => {
    if (Number(tr.dataset.src) <= line) best = tr;
  });
  revealElement(best ?? section.querySelector(".file-head")!);
}
onRevealRequest(reveal);

/** One HTML file with the header and all files open, in the view as chosen. */
function exportHtml(): string {
  if (!patch || !current) return "";
  const css = [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
  const view = document.documentElement.dataset.view;
  const title = esc(patch.meta.subject ?? fileName(current.path));
  return (
    `<!doctype html>\n<html lang="en"${view ? ` data-view="${view}"` : ""}><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}</style></head>` +
    `<body class="export"><div class="layout no-side"><main id="content">${metaHtml(patch, fileName(current.path))}` +
    patch.files.map((f, i) => fileHtml(f, i, true)).join("") +
    `</main></div></body></html>\n`
  );
}

// ---- files -------------------------------------------------------------------------------

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
