/*
 * Builds what the preview frame runs on into dist/runtime/: React and the
 * packages that come with Tusq as ES modules, plus the host script (which
 * brings Tailwind). The backend serves these files as tusq://localhost/~/…
 * (src-tauri/src/protocol.rs: BUILT_IN lists the same packages).
 *
 * One build with several entries: what the packages share (React itself)
 * ends up in common chunks, so there is exactly one React in the page.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

/** File name → package. CommonJS packages get a wrapper that names their exports. */
const PACKAGES = {
  react: { from: "react", cjs: true },
  "react-jsx-runtime": { from: "react/jsx-runtime", cjs: true },
  "react-dom": { from: "react-dom", cjs: true },
  "react-dom-client": { from: "react-dom/client", cjs: true },
  "lucide-react": { from: "lucide-react" },
  recharts: { from: "recharts" },
};

const WRAPPER = "\0tusq-wrapper:";
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** `import m from "pkg"; export default m; export const { a, b } = m;` for a CommonJS package. */
const wrappers = {
  name: "tusq-cjs-wrappers",
  resolveId: (id) => (id.startsWith(WRAPPER) ? id : null),
  load(id) {
    if (!id.startsWith(WRAPPER)) return null;
    const from = id.slice(WRAPPER.length);
    const names = Object.keys(require(from)).filter((k) => k !== "default" && IDENTIFIER.test(k));
    return `import m from ${JSON.stringify(from)};\nexport default m;\nexport const { ${names.join(", ")} } = m;\n`;
  },
};

const input = { host: fileURLToPath(new URL("host.ts", import.meta.url)) };
for (const [name, { from, cjs }] of Object.entries(PACKAGES)) input[name] = cjs ? WRAPPER + from : from;

await build({
  root,
  configFile: false,
  logLevel: "warn",
  plugins: [wrappers],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/runtime",
    emptyOutDir: true,
    target: "es2022",
    modulePreload: false,
    copyPublicDir: false,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      input,
      preserveEntrySignatures: "strict",
      // "use client" means nothing in a bundle for the browser.
      onLog: (level, log, handler) => log.code !== "MODULE_LEVEL_DIRECTIVE" && handler(level, log),
      output: { format: "es", entryFileNames: "[name].js", chunkFileNames: "chunk-[hash].js" },
    },
  },
});
