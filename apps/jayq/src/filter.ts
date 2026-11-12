/**
 * jq filter view: the frame's split view with the JSON on the left, an
 * editable jq filter in the middle and its output on the right.
 *
 * The filter runs in the backend (jaq, a jq implementation in Rust), in a
 * process of its own that is ended after a few seconds or when the next run
 * starts. Like jq, it is applied to every value of the input and may yield
 * any number of outputs; they are shown one after the other.
 */
import { invoke } from "@tauri-apps/api/core";
import { initSplit, type Output } from "@qiew/frame/split";
import { renderJson } from "./json";

/** Starting point: passes the input through unchanged. */
const IDENTITY = `# Identity: passes the JSON through unchanged.
# Try  .[0]   .name   map(.id)   to_entries   [.. | numbers] | add
.
`;

async function run(source: string, filter: string): Promise<Output> {
  let result: { output: string; ms: number };
  try {
    result = await invoke("run_jq", { source, filter });
  } catch (e) {
    throw new Error(String(e));
  }
  const view = renderJson(result.output);
  return {
    html: view.html || `<div class="ln"><span class="x-com">No output</span></div>`,
    // Formatted like the JSON view; if something is off, as the engine wrote it.
    text: view.ok ? view.text : result.output,
    ext: "json",
    ms: result.ms,
  };
}

/** `source` returns the text of the open JSON document, or null. */
export function initFilter(source: () => string | null) {
  initSplit({
    source,
    noSource: "Kein JSON geladen.",
    initial: IDENTITY,
    run,
    loadFilter: { name: "jq", extensions: ["jq"] },
  });
}
