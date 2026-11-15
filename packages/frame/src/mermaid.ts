/**
 * Mermaid diagrams, drawn the same way in every viewer that shows them (Maiqe for Mermaid files,
 * Marq for ```mermaid blocks in Markdown). Mermaid is large, so it is loaded only once a diagram
 * is actually drawn: a viewer whose document has none starts as fast as without it.
 *
 * Nothing in a diagram is run: `securityLevel: "strict"` makes Mermaid sanitise labels and drop
 * click handlers and scripts.
 */
import type { Mermaid } from "mermaid";
import { VIEWS, effectiveView } from "./views";

let loading: Promise<Mermaid> | null = null;
const load = () => (loading ??= import("mermaid").then((m) => m.default));

/** Whether diagrams are to be drawn for a dark background (follows the colour scheme). */
export const diagramsDark = () => VIEWS.find((v) => v.id === effectiveView())!.dark;

export type Drawn = { svg: string; error?: undefined } | { svg?: undefined; error: string };

/**
 * Draws one diagram. `id` must be unique in the document for the time of drawing; Mermaid uses
 * it for the SVG's own element ids.
 */
export async function drawDiagram(id: string, text: string): Promise<Drawn> {
  const mermaid = await load();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: diagramsDark() ? "dark" : "default",
    // The window's own font: it is there, which the fonts Mermaid asks for by default need not be.
    fontFamily: getComputedStyle(document.body).fontFamily,
  });
  try {
    return { svg: (await mermaid.render(id, text)).svg };
  } catch (err) {
    // Mermaid leaves its error drawing behind.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Calls `redraw` when the colour scheme changes between light and dark. */
export function onDiagramThemeChange(redraw: () => void) {
  let dark = diagramsDark();
  const changed = () => {
    if (diagramsDark() === dark) return;
    dark = diagramsDark();
    redraw();
  };
  new MutationObserver(changed).observe(document.documentElement, { attributes: true, attributeFilter: ["data-view"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", changed);
}
