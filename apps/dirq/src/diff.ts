/**
 * Reading patch files: unified diffs as `git diff`, `git format-patch`, IntelliJ IDEA's
 * "Create Patch", Subversion and plain `diff -u` write them. No DOM in here.
 */

export type Status = "modified" | "added" | "deleted" | "renamed" | "copied";

export interface DiffLine {
  type: " " | "+" | "-";
  text: string;
  oldNo?: number;
  newNo?: number;
  /** Line number in the patch file, for `--line`. */
  src: number;
  /** "\ No newline at end of file" followed this line. */
  noEol?: boolean;
}

export interface Hunk {
  header: string; // the @@ line
  section: string; // what follows the second @@ (a function name, usually)
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
  src: number;
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  status: Status;
  binary: boolean;
  /** "100644 → 100755" and the like. */
  modeChange?: string;
  similarity?: number;
  /** What the --- and +++ lines say besides the path: a revision, a date. */
  oldInfo?: string;
  newInfo?: string;
  hunks: Hunk[];
  added: number;
  deleted: number;
  src: number;
  srcEnd: number;
}

export interface Meta {
  generator: "git" | "idea" | "svn" | "plain";
  subject?: string;
  tag?: string; // "PATCH 2/3"
  author?: string;
  date?: string;
  commit?: string;
  message: string;
  trailers: [string, string][];
  /** Header lines the patch carries that mean nothing to a reader (kept for completeness). */
  other: string[];
}

export interface Patch {
  meta: Meta;
  files: FileDiff[];
  added: number;
  deleted: number;
}

const TRAILER_KEY = /^[A-Za-z][A-Za-z0-9-]*$/;

/** a/ and b/ prefixes, quotes and the tab suffix are not part of the path. */
function cleanPath(raw: string): { path: string; info?: string } {
  let [path, ...rest] = raw.split("\t");
  path = path.trim();
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  const info = rest.join("\t").trim() || undefined;
  return { path, info };
}

const stripPrefix = (p: string, prefix: "a/" | "b/") => (p.startsWith(prefix) ? p.slice(2) : p);

/** `(revision 5ec745…)`, `(date 1794662246000)` → "revision 5ec7450 · …". */
export function describeInfo(info: string | undefined): string | undefined {
  if (!info) return undefined;
  const inner = info.replace(/^\((.*)\)$/, "$1").trim();
  const date = inner.match(/^date (\d{10,13})$/);
  if (date) {
    const ms = date[1].length === 10 ? Number(date[1]) * 1000 : Number(date[1]);
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  const rev = inner.match(/^revision ([0-9a-f]{12,40})$/i);
  if (rev) return `revision ${rev[1].slice(0, 7)}`;
  if (inner === "nonexistent" || inner === "working copy") return inner;
  return inner;
}

export function parsePatch(text: string): Patch | null {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  const files: FileDiff[] = [];
  let file = null as FileDiff | null;
  let sawOld = false; // `---` read for the current file
  let first = -1; // index of the first line that belongs to a file
  let idea = false;
  let svn = false;
  let fromIndex = false; // the current file was started by an `Index:` line, so `diff --git` may belong to it
  let git = false;

  const newFile = (i: number): FileDiff => {
    file = { oldPath: "", newPath: "", status: "modified", binary: false, hunks: [], added: 0, deleted: 0, src: i + 1, srcEnd: i + 1 };
    files.push(file);
    sawOld = false;
    fromIndex = false;
    if (first < 0) first = i;
    return file;
  };
  const fresh = (): boolean => file !== null && file.hunks.length === 0 && !sawOld;

  let i = 0;
  // Look for where the first file starts; what is before is the header.
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("diff ") || l.startsWith("Index: ") || (l.startsWith("--- ") && lines[i + 1]?.startsWith("+++ "))) break;
  }
  const headerLines = lines.slice(0, i);

  for (; i < lines.length; i++) {
    const l = lines[i];
    let m: RegExpMatchArray | null;

    if (l.startsWith("diff --git ")) {
      git = true;
      const f = fromIndex && fresh() ? file! : newFile(i);
      fromIndex = false;
      const both = l.slice("diff --git ".length);
      // "a/x b/x": split in the middle, which is where both halves read the same.
      const half = both.match(/^"?a\/(.*?)"? "?b\/(.*?)"?$/);
      if (half) [f.oldPath, f.newPath] = [half[1], half[2]];
      f.src = i + 1;
    } else if (l.startsWith("Index: ")) {
      if (/^IDEA additional info/.test(lines[i + 1] ?? "")) idea = true;
      if (!fresh()) newFile(i);
      fromIndex = true;
      file!.newPath = file!.newPath || cleanPath(l.slice(7)).path;
      file!.oldPath = file!.oldPath || file!.newPath;
      svn = !git;
    } else if (l.startsWith("diff ") && !file?.hunks.length && !l.startsWith("diff --git")) {
      if (!fresh()) newFile(i);
    } else if (l.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ") && !(file && file.hunks.length === 0 && sawOld)) {
      const f = file && !sawOld && file.hunks.length === 0 ? file : newFile(i);
      const a = cleanPath(l.slice(4));
      const b = cleanPath(lines[i + 1].slice(4));
      sawOld = true;
      if (a.path === "/dev/null") f.status = "added";
      else f.oldPath = stripPrefix(a.path, "a/");
      if (b.path === "/dev/null") f.status = "deleted";
      else f.newPath = stripPrefix(b.path, "b/");
      if (a.path === "/dev/null") f.oldPath = "";
      if (b.path === "/dev/null") f.newPath = "";
      f.oldInfo = a.info;
      f.newInfo = b.info;
      i++; // the +++ line
    } else if (file && (m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/))) {
      const hunk: Hunk = { header: l, section: m[5], oldStart: +m[1], newStart: +m[3], lines: [], src: i + 1 };
      let remOld = m[2] === undefined ? 1 : +m[2];
      let remNew = m[4] === undefined ? 1 : +m[4];
      let oldNo = hunk.oldStart;
      let newNo = hunk.newStart;
      let j = i + 1;
      for (; j < lines.length && (remOld > 0 || remNew > 0 || lines[j].startsWith("\\")); j++) {
        const t = lines[j];
        const c = t[0];
        if (c === "\\") {
          const prev = hunk.lines[hunk.lines.length - 1];
          if (prev) prev.noEol = true;
        } else if (c === "+") {
          hunk.lines.push({ type: "+", text: t.slice(1), newNo: newNo++, src: j + 1 });
          remNew--;
          file.added++;
        } else if (c === "-") {
          hunk.lines.push({ type: "-", text: t.slice(1), oldNo: oldNo++, src: j + 1 });
          remOld--;
          file.deleted++;
        } else if (c === " " || t === "") {
          hunk.lines.push({ type: " ", text: t.slice(1), oldNo: oldNo++, newNo: newNo++, src: j + 1 });
          remOld--;
          remNew--;
        } else break; // the hunk is shorter than it says
      }
      file.hunks.push(hunk);
      file.srcEnd = j;
      i = j - 1;
    } else if (file && !sawOld) {
      // Extended header lines between `diff --git` and `---`.
      if ((m = l.match(/^new file mode (\d+)/))) {
        file.status = "added";
        file.modeChange = `new file, mode ${m[1]}`;
      } else if ((m = l.match(/^deleted file mode (\d+)/))) {
        file.status = "deleted";
        file.modeChange = `deleted file, mode ${m[1]}`;
      } else if ((m = l.match(/^old mode (\d+)/))) {
        file.modeChange = `mode ${m[1]}`;
      } else if ((m = l.match(/^new mode (\d+)/))) {
        file.modeChange = `${file.modeChange ?? "mode ?"} → ${m[1]}`;
      } else if ((m = l.match(/^(rename|copy) from (.*)$/))) {
        file.status = m[1] === "rename" ? "renamed" : "copied";
        file.oldPath = m[2];
      } else if ((m = l.match(/^(rename|copy) to (.*)$/))) {
        file.newPath = m[2];
      } else if ((m = l.match(/^similarity index (\d+)%/))) {
        file.similarity = +m[1];
      } else if (/^(Binary files .* differ|GIT binary patch)/.test(l)) {
        file.binary = true;
      }
    } else if (file && /^(Binary files .* differ|GIT binary patch)/.test(l)) {
      file.binary = true;
    }
    if (file) (file as FileDiff).srcEnd = Math.max((file as FileDiff).srcEnd, i + 1);
  }

  for (const f of files) {
    if (!f.newPath && f.status !== "deleted") f.newPath = f.oldPath;
    if (!f.oldPath && f.status !== "added") f.oldPath = f.newPath;
    if (f.status === "modified" && f.oldPath && f.newPath && f.oldPath !== f.newPath) f.status = "renamed";
  }
  const kept = files.filter((f) => f.hunks.length > 0 || f.binary || f.status !== "modified" || f.modeChange);
  if (kept.length === 0) return null;

  const meta = parseHeader(headerLines, idea ? "idea" : git ? "git" : svn ? "svn" : "plain");
  const added = kept.reduce((n, f) => n + f.added, 0);
  const deleted = kept.reduce((n, f) => n + f.deleted, 0);
  return { meta, files: kept, added, deleted };
}

/** The mail or commit header before the first file. */
function parseHeader(lines: string[], generator: Meta["generator"]): Meta {
  const meta: Meta = { generator, message: "", trailers: [], other: [] };
  let i = 0;
  const from = lines[0]?.match(/^From ([0-9a-f]{7,40}) /);
  if (from) {
    meta.commit = from[1];
    i = 1;
  }
  // Mail headers: Key: value, continued by lines starting with whitespace.
  let key = "";
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l === "") break;
    const cont = /^\s/.test(l) && key;
    const kv = l.match(/^([A-Za-z-]+):\s?(.*)$/);
    if (!cont && !kv) break;
    const value = cont ? l.trim() : kv![2];
    if (!cont) key = kv![1].toLowerCase();
    const set = (k: "subject" | "author" | "date") => {
      meta[k] = cont ? `${meta[k] ?? ""} ${value}`.trim() : value;
    };
    if (key === "subject") set("subject");
    else if (key === "from") set("author");
    else if (key === "date") set("date");
    else if (!cont) meta.other.push(l);
  }
  if (meta.subject) {
    const tag = meta.subject.match(/^\[([^\]]*PATCH[^\]]*)\]\s*/i);
    if (tag) {
      meta.tag = tag[1];
      meta.subject = meta.subject.slice(tag[0].length);
    }
  }
  // Message: up to the line that is only "---" (what follows is the diffstat).
  const rest = lines.slice(i);
  const end = rest.findIndex((l) => l === "---");
  const body = (end >= 0 ? rest.slice(0, end) : rest).join("\n").trim();
  const paragraphs = body === "" ? [] : body.split(/\n{2,}/);
  const last = paragraphs[paragraphs.length - 1]?.split("\n") ?? [];
  if (paragraphs.length > 0 && last.length > 0 && last.every((l) => /^[A-Za-z][A-Za-z0-9-]*: \S/.test(l) && TRAILER_KEY.test(l.split(":")[0]))) {
    meta.trailers = last.map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 2)] as [string, string]);
    paragraphs.pop();
  }
  meta.message = paragraphs.join("\n\n");
  if (!meta.subject && meta.message) {
    // A header-less message (plain diff with a note on top): its first line is the title.
    const [head, ...more] = meta.message.split("\n");
    meta.subject = head;
    meta.message = more.join("\n").trim();
  }
  return meta;
}

// ---- inside a line -----------------------------------------------------------------------

export interface Span {
  from: number;
  to: number;
}

const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

/**
 * The parts of two lines that differ, as ranges in each: words are compared, so the
 * highlight reads as "this was changed", not as scattered letters. Null if the lines
 * have too little in common to be worth it.
 */
export function inlineDiff(a: string, b: string): { a: Span[]; b: Span[] } | null {
  const x = a.match(TOKEN) ?? [];
  const y = b.match(TOKEN) ?? [];
  if (x.length === 0 || y.length === 0 || x.length * y.length > 160_000) return null;

  // Longest common subsequence of the tokens.
  const w = y.length + 1;
  const table = new Uint16Array((x.length + 1) * w);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      table[i * w + j] = x[i] === y[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const common = table[0];
  const sameChars = (() => {
    let n = 0;
    for (let i = 0, j = 0; i < x.length && j < y.length; ) {
      if (x[i] === y[j]) {
        n += x[i].length;
        i++;
        j++;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) i++;
      else j++;
    }
    return n;
  })();
  if (common === 0 || sameChars < Math.min(a.length, b.length) * 0.3) return null;

  const spansA: Span[] = [];
  const spansB: Span[] = [];
  const push = (spans: Span[], from: number, to: number) => {
    if (to <= from) return;
    const last = spans[spans.length - 1];
    if (last && last.to === from) last.to = to;
    else spans.push({ from, to });
  };
  let i = 0, j = 0, pa = 0, pb = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      pa += x[i].length;
      pb += y[j].length;
      i++;
      j++;
    } else if (j >= y.length || (i < x.length && table[(i + 1) * w + j] >= table[i * w + j + 1])) {
      push(spansA, pa, pa + x[i].length);
      pa += x[i++].length;
    } else {
      push(spansB, pb, pb + y[j].length);
      pb += y[j++].length;
    }
  }
  return { a: spansA, b: spansB };
}
