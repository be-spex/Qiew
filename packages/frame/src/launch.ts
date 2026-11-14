/**
 * What the command line asked for beyond the file: `--line <n>` shows that
 * line once the file is open (also when a running viewer is handed a file,
 * see the backend's `qiew_frame::launch`). How a line is found is up to the
 * view; the helpers here cover text and elements.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { scrollDocBy } from "./scroll";

const MARK_MS = 2200;

/** Upper edge of the visible content: below the toolbar. */
const contentTop = () => document.getElementById("toolbar")?.getBoundingClientRect().bottom ?? 0;

function scrollTo(box: DOMRect) {
  // A quarter down the view, so the lines before it give context.
  scrollDocBy(box.top - contentTop() - (window.innerHeight - contentTop()) / 4);
}

/**
 * Calls `reveal` with the line to show, if one was asked for: to be called
 * after a file has been opened and rendered (not on a live reload). The
 * line is handed out once.
 */
export async function revealLaunchLine(reveal: (line: number) => void) {
  const line = await invoke<number | null>("take_line").catch(() => null);
  if (line) reveal(line);
}

/** A running viewer may be asked for a line of the file it already shows. */
export function onRevealRequest(reveal: (line: number) => void) {
  listen("reveal-line", () => revealLaunchLine(reveal));
}

/** Scrolls to an element and marks it for a moment. */
export function revealElement(el: Element) {
  scrollTo(el.getBoundingClientRect());
  el.classList.add("launch-line");
  setTimeout(() => el.classList.remove("launch-line"), MARK_MS);
}

/**
 * Shows line `n` (1-based) of the text inside `root`, whatever elements the
 * text is spread over: scrolls to it and marks it for a moment.
 */
export function revealTextLine(root: Element, n: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let line = 1;
  let started = false;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const text = node.data;
    let from = 0;
    if (!started) {
      // Skip the line breaks before line n.
      while (line < n) {
        const next = text.indexOf("\n", from);
        if (next < 0) break;
        from = next + 1;
        line++;
      }
      if (line < n) continue;
      range.setStart(node, from);
      started = true;
    }
    const end = text.indexOf("\n", from);
    if (end >= 0) {
      range.setEnd(node, end);
      break;
    }
    range.setEnd(node, text.length);
  }
  if (!started) return;
  const box = range.getBoundingClientRect();
  if (!box.height && !box.width) return; // an empty line at the very end
  scrollTo(box);
  // Marked without touching the document (the search works the same way).
  if ("highlights" in CSS) {
    CSS.highlights.set("launch-line", new Highlight(range));
    setTimeout(() => CSS.highlights.delete("launch-line"), MARK_MS);
  }
}
