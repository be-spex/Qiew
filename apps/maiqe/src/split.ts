/**
 * A Mermaid file holds one diagram – officially. In practice files carry several: an assistant
 * writes three diagrams into one .mmd, or the file is Markdown with ```mermaid fences. This
 * takes such a text apart. No DOM in here.
 */

export interface Part {
  /** The diagram's text, as Mermaid gets it. */
  text: string;
  /** First line in the file (1-based). */
  line: number;
  /** From front matter (`title:`) or a comment right above the diagram, if any. */
  title?: string;
  /** What kind of diagram it says it is: "flowchart", "sequenceDiagram" … */
  kind: string;
}

/** The words a diagram starts with. */
const KEYWORD =
  /^(flowchart|graph|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|zenuml|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban|architecture(?:-beta)?|radar(?:-beta)?|treemap(?:-beta)?|C4(?:Context|Container|Component|Dynamic|Deployment))\b/;

const NAMES: Record<string, string> = {
  flowchart: "Flowchart", graph: "Flowchart", sequenceDiagram: "Sequence diagram", classDiagram: "Class diagram",
  stateDiagram: "State diagram", erDiagram: "Entity relationship diagram", journey: "User journey", gantt: "Gantt chart",
  pie: "Pie chart", quadrantChart: "Quadrant chart", requirementDiagram: "Requirement diagram", gitGraph: "Git graph",
  mindmap: "Mind map", timeline: "Timeline", zenuml: "ZenUML", sankey: "Sankey diagram", xychart: "XY chart",
  block: "Block diagram", packet: "Packet diagram", kanban: "Kanban board", architecture: "Architecture diagram",
  radar: "Radar chart", treemap: "Treemap", C4: "C4 diagram",
};

/** "Sequence diagram" for "sequenceDiagram", "stateDiagram-v2" … */
export function kindName(kind: string): string {
  const base = kind.replace(/-(v2|beta)$/, "").replace(/^C4.*/, "C4");
  return NAMES[base] ?? (kind || "Diagram");
}

function describe(lines: string[], first: number): Part {
  // The part begins with its first line that says something.
  const blank = lines.findIndex((l) => l.trim() !== "");
  if (blank > 0) {
    lines = lines.slice(blank);
    first += blank;
  }
  let title: string | undefined;
  let kind = "";
  let inFront = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (t === "---" && (i === 0 || inFront)) {
      inFront = !inFront;
      continue;
    }
    if (inFront) {
      const m = l.match(/^\s*title:\s*(.+)$/);
      if (m) title = m[1].trim().replace(/^["']|["']$/g, "");
      continue;
    }
    const k = t.match(KEYWORD);
    if (k) {
      kind = k[1];
      break;
    }
    // A comment right above the diagram names it: %% Order flow
    const c = t.match(/^%%(?!\{)\s*(.+)$/);
    if (c && !title) title = c[1].trim();
  }
  return { text: lines.join("\n").trim(), line: first, title, kind };
}

export function split(source: string): Part[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  // Markdown with ```mermaid fences: the fences are the diagrams.
  const fenced: Part[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(```|~~~)\s*mermaid\s*$/i.test(lines[i])) continue;
    const close = lines[i].trim().slice(0, 3);
    const start = i + 1;
    let end = start;
    while (end < lines.length && lines[end].trim() !== close) end++;
    const part = describe(lines.slice(start, end), start + 1);
    if (!part.title) {
      // The heading above the fence names the diagram.
      for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
        const h = lines[j].match(/^#{1,6}\s+(.+)$/);
        if (h) {
          part.title = h[1].trim();
          break;
        }
        if (lines[j].trim() !== "") break;
      }
    }
    if (part.text) fenced.push(part);
    i = end;
  }
  if (fenced.length > 0) return fenced;

  // Otherwise a new diagram begins where a diagram keyword stands at the start of a line while
  // one is already open. What comes before the keyword – front matter, directives, comments,
  // blank lines – belongs to the diagram that follows.
  const starts: number[] = [];
  let open = false; // a keyword has been seen for the current part
  let lead = 0; // where the lines leading up to the next keyword begin
  let inFront = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (t === "---" && !/^\s/.test(l)) {
      // Front matter opens only where nothing but lead-in came before.
      if (inFront) inFront = false;
      else if (lead === i || lines.slice(lead, i).every((x) => x.trim() === "" || x.trim().startsWith("%%"))) {
        inFront = true;
        if (lead !== i && lines.slice(lead, i).every((x) => x.trim() === "")) lead = i;
      }
      continue;
    }
    if (inFront) continue;
    if (KEYWORD.test(l)) {
      if (open || starts.length === 0) starts.push(starts.length === 0 ? 0 : lead);
      open = true;
      lead = i + 1;
      continue;
    }
    if (t === "" || t.startsWith("%%")) {
      // Lead-in for a possible next diagram starts after the last line of content.
      continue;
    }
    lead = i + 1;
  }
  if (starts.length <= 1) return [describe(lines, 1)].filter((p) => p.text);
  return starts
    .map((from, n) => describe(lines.slice(from, starts[n + 1] ?? lines.length), from + 1))
    .filter((p) => p.text);
}
