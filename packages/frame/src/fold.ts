/**
 * Folding of nodes (`.node` in the markup built by `block` in fragment.ts).
 * A click on the triangle or on the "…" of a folded node toggles it;
 * Alt+click toggles the node together with everything below it.
 */

function setCollapsed(node: Element, collapsed: boolean) {
  node.classList.toggle("collapsed", collapsed);
  node.querySelector(":scope > .open > .tw")?.setAttribute("aria-expanded", String(!collapsed));
}

export function initFold(root: HTMLElement) {
  root.addEventListener("click", (e) => {
    const hit = (e.target as Element).closest(".tw, .ellip");
    const node = hit?.closest(".node");
    if (!node) return;
    const collapse = !node.classList.contains("collapsed");
    setCollapsed(node, collapse);
    if (e.altKey) node.querySelectorAll(".node").forEach((n) => setCollapsed(n, collapse));
  });
}

/** Expands everything; collapsing keeps the outermost level open. */
export function setAllCollapsed(root: HTMLElement, collapsed: boolean) {
  root.querySelectorAll(".node").forEach((n) => {
    const nested = n.parentElement?.closest(".node") != null;
    setCollapsed(n, collapsed && nested);
  });
}

export function collapsedPaths(root: HTMLElement): Set<string> {
  const paths = new Set<string>();
  root.querySelectorAll<HTMLElement>(".node.collapsed").forEach((n) => paths.add(n.dataset.p!));
  return paths;
}

/** Re-applies fold state after a re-render (live reload); unknown paths stay open. */
export function restoreFolds(root: HTMLElement, paths: Set<string>) {
  if (paths.size === 0) return;
  root.querySelectorAll<HTMLElement>(".node").forEach((n) => {
    if (paths.has(n.dataset.p!)) setCollapsed(n, true);
  });
}

/** Unfolds every collapsed ancestor of `node`, so it becomes visible. */
export function unfoldAround(node: Node) {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (el.classList.contains("collapsed")) setCollapsed(el, false);
  }
}
