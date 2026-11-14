/** Reading delimited text and the small things done with it. No DOM in here. */

export type Delimiter = "," | ";" | "\t" | "|";
export const DELIMITER_NAMES: Record<Delimiter, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };

/** The delimiter a file most likely uses: the one that splits the first lines evenly. */
export function detectDelimiter(text: string, name: string): Delimiter {
  if (/\.tsv$/i.test(name)) return "\t";
  const lines = text.slice(0, 20000).split(/\r?\n/).filter((l) => l !== "").slice(0, 8);
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const d of [",", ";", "\t", "|"] as Delimiter[]) {
    const counts = lines.map((l) => splitCount(l, d));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const same = counts.filter((c) => c === first).length;
    const score = same * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Number of delimiters in a line outside quotes. */
function splitCount(line: string, d: string): number {
  let n = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === d && !quoted) n++;
  }
  return n;
}

/** RFC 4180 plus what spreadsheets do: quotes, doubled quotes, line breaks inside quotes, BOM. */
export function parse(text: string, delimiter: Delimiter): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: string[][], delimiter: Delimiter = ","): string {
  const quote = (v: string) => (v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(quote).join(delimiter)).join("\n") + "\n";
}

/** A number as people write it: 1234.5, -3, 1.234,56 (German), 1,234.56, 12 %. */
export function toNumber(value: string): number | null {
  const v = value.trim().replace(/\s?%$/, "");
  if (v === "" || !/^[-+]?[\d.,']+$/.test(v) || !/\d/.test(v)) return null;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  let t = v.replace(/'/g, "");
  if (lastComma >= 0 && lastDot >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // 1,5 is a decimal comma; 1,234 and 1,234,567 are thousands.
    t = /^[-+]?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if ((t.match(/\./g) ?? []).length > 1) {
    t = t.replace(/\./g, "");
  }
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

// ---- dates -------------------------------------------------------------------------------

export interface Stamp {
  time: number; // ms since the epoch (local time where the value has no zone)
  hasTime: boolean;
}

/**
 * A date or date and time as files have them: 2026-11-14, 2026-11-14T09:30:00Z,
 * 2026-11-14 09:30, 14.11.2026, 14.11.2026 09:30, 2026/11/14. Slashes with the year
 * last (03/04/2026) are ambiguous and not taken for dates.
 */
export function toDate(value: string): Stamp | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/);
  let y: number, mo: number, d: number, rest: string[];
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    rest = [m[4], m[5], m[6], m[7]];
  } else {
    m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    rest = [m[4], m[5], m[6], undefined as unknown as string];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const [hh, mi, ss, zone] = rest;
  const hasTime = hh !== undefined;
  const parts = [y, mo - 1, d, hasTime ? +hh : 0, hasTime ? +mi : 0, hasTime && ss ? +ss : 0] as const;
  let time: number;
  if (zone) {
    const offset = zone === "Z" ? 0 : (zone[0] === "-" ? -1 : 1) * (+zone.slice(1, 3) * 60 + +zone.slice(-2));
    time = Date.UTC(...parts) - offset * 60000;
  } else time = new Date(...parts).getTime();
  return Number.isNaN(time) ? null : { time, hasTime };
}

export type Kind = "number" | "date" | "text";

/** What a column holds: only numbers, only dates, or text. Empty cells do not count. */
export function kindOf(values: string[]): Kind {
  const filled = values.filter((v) => v.trim() !== "");
  if (filled.length === 0) return "text";
  // 14.11.2026 would also read as a number (14112026): dates first.
  if (filled.every((v) => toDate(v) !== null)) return "date";
  if (filled.every((v) => toNumber(v) !== null)) return "number";
  return "text";
}

// ---- display -----------------------------------------------------------------------------

/** Columns whose numbers are labels, not quantities: no thousands separators there. */
const IDENTIFIER = /(^|[\s_.-])(id|nr|no|num|number|nummer|plz|zip|postal|code|jahr|year|tel|phone|iban|ean|sku|key)([\s_.-]|$)/i;

export interface NumberFormat {
  (value: string): string;
}

/**
 * How the numbers of a column are shown: the same count of decimals in every row and,
 * for quantities, thousands separators. Identifiers (postcodes, numbers with leading
 * zeros) stay as written. The file's text is still what is searched, sorted by value
 * and exported.
 */
export function numberFormat(values: string[], name: string): NumberFormat | null {
  const filled = values.filter((v) => v.trim() !== "");
  if (filled.some((v) => /^[-+]?0\d/.test(v.trim())) || IDENTIFIER.test(name)) return null;
  const percent = filled.every((v) => /%\s*$/.test(v));
  let decimals = 0;
  for (const v of filled) {
    const t = v.trim().replace(/\s?%$/, "");
    const sep = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
    const tail = sep >= 0 ? t.slice(sep + 1) : "";
    // 1,234 is thousands unless it is the only separator kind used with a decimal reading.
    if (sep >= 0 && !(tail.length === 3 && /^[-+]?\d{1,3}([.,]\d{3})+$/.test(t))) decimals = Math.max(decimals, tail.length);
  }
  decimals = Math.min(decimals, 6);
  const nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v) => {
    const x = toNumber(v);
    if (x === null || Math.abs(x) >= 1e15) return v;
    return nf.format(x) + (percent ? " %" : "");
  };
}

/** Dates in the reader's language: 14.11.2026, 14 Nov 2026 09:30 … */
export function dateFormat(values: string[]): (value: string) => string {
  const stamps = values.map(toDate);
  const withTime = stamps.some((s) => s?.hasTime);
  const f = new Intl.DateTimeFormat(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
  return (v) => {
    const s = toDate(v);
    return s ? f.format(s.time) : v;
  };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Numbers before text, numbers by value, text naturally; empty cells always last. */
export function compare(a: string, b: string, descending: boolean, kind: Kind = "text"): number {
  if (a.trim() === "" || b.trim() === "") return a.trim() === b.trim() ? 0 : a.trim() === "" ? 1 : -1;
  if (kind === "date") {
    const c = (toDate(a)?.time ?? 0) - (toDate(b)?.time ?? 0);
    return descending ? -c : c;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  let c: number;
  if (x !== null && y !== null) c = x - y;
  else if (x !== null || y !== null) c = x !== null ? -1 : 1;
  else c = collator.compare(a, b);
  return descending ? -c : c;
}

export type Test = (value: string) => boolean;

/**
 * A column filter as typed: `abc` contains (any case), `=abc` equals, `!abc` does not
 * contain, `>5` `>=5` `<5` `<=5` compare numbers, `/re/` a regular expression.
 * Null if it is not (yet) valid.
 */
export function filterOf(input: string, kind: Kind = "text"): Test | null | undefined {
  const text = input.trim();
  if (text === "") return undefined;
  const relation = text.match(/^(>=|<=|>|<)\s*(.+)$/);
  if (relation) {
    const asValue = kind === "date" ? (v: string) => toDate(v)?.time ?? null : toNumber;
    const limit = asValue(relation[2]);
    if (limit === null) return null;
    const op = relation[1];
    return (v) => {
      const x = asValue(v);
      return x !== null && (op === ">" ? x > limit : op === ">=" ? x >= limit : op === "<" ? x < limit : x <= limit);
    };
  }
  if (text.length > 2 && text.startsWith("/") && text.endsWith("/")) {
    try {
      const re = new RegExp(text.slice(1, -1), "iu");
      return (v) => re.test(v);
    } catch {
      return null;
    }
  }
  if (text.startsWith("=")) {
    const want = text.slice(1).trim().toLowerCase();
    return (v) => v.trim().toLowerCase() === want;
  }
  if (text.startsWith("!")) {
    const word = text.slice(1).trim().toLowerCase();
    return (v) => !v.toLowerCase().includes(word);
  }
  const word = text.toLowerCase();
  return (v) => v.toLowerCase().includes(word);
}
