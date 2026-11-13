#!/usr/bin/env node
// Takes the screenshots of Marq, Xaq and Jayq from their real frontends.
//
//   node tools/screenshots/shoot.mjs [options]
//
//   --shot <name>    only this image (repeatable); default: all, see shots.mjs
//   --theme <name>   theme to take (repeatable): light, dark, sepia, nord;
//                    default: light and dark
//   --no-build       use the existing apps/<app>/dist instead of building first
//   --readme         also copy the PNGs to apps/<app>/docs/images/
//   --site [dir]     also write WebP files to <dir>/public/shots/
//                    (default dir: ../../be-spex.github.io next to this repo)
//   --out <dir>      where the PNGs go (default: tools/screenshots/out)
//
// Needs Chromium or Chrome and Node 22. No Tauri, no display: the frontends run
// against mock-tauri.js with the demo files from demo/. Jq filters run in the
// real engine (jayq --jq-worker; set JAYQ_BIN to use another binary).
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THEMES, SHOTS, THEMES } from "./shots.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SCALE = 2;

// ---- options ----------------------------------------------------------------
const args = process.argv.slice(2);
const opt = { shots: [], themes: [], build: true, readme: false, site: null, out: path.join(HERE, "out") };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--shot") opt.shots.push(args[++i]);
  else if (a === "--theme") opt.themes.push(args[++i]);
  else if (a === "--no-build") opt.build = false;
  else if (a === "--readme") opt.readme = true;
  else if (a === "--site") opt.site = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : path.resolve(ROOT, "../be-spex.github.io");
  else if (a === "--out") opt.out = path.resolve(args[++i]);
  else die(`unknown option ${a}`);
}
if (!opt.themes.length) opt.themes = DEFAULT_THEMES;
for (const t of opt.themes) if (!THEMES[t]) die(`unknown theme ${t} (${Object.keys(THEMES).join(", ")})`);
const shots = opt.shots.length ? SHOTS.filter((s) => opt.shots.includes(s.name)) : SHOTS;
if (!shots.length) die(`no such image; available: ${SHOTS.map((s) => s.name).join(", ")}`);

function die(msg) {
  console.error(`shoot: ${msg}`);
  process.exit(1);
}

// ---- build ------------------------------------------------------------------
const apps = [...new Set(shots.map((s) => s.app))];
if (opt.build) {
  for (const app of apps) {
    console.log(`building ${app} …`);
    const r = spawnSync("npm", ["run", "build", "--workspace", `apps/${app}`], { cwd: ROOT, stdio: "inherit" });
    if (r.status) die(`build of ${app} failed`);
  }
}
for (const app of apps) if (!existsSync(path.join(ROOT, "apps", app, "dist", "index.html"))) die(`apps/${app}/dist is missing (drop --no-build)`);

// ---- demo data --------------------------------------------------------------
const demoDir = path.join(HERE, "demo");
const demoFile = (name) => `/demo/${name}`;
const read = (name) => readFileSync(path.join(demoDir, name), "utf8");

/** Runs a jq filter in Jayq's own engine, like the app does. */
function runJq(filter, source) {
  const bin = process.env.JAYQ_BIN || "jayq";
  const r = spawnSync(bin, ["--jq-worker", filter], { input: source, encoding: "utf8" });
  if (r.error || r.status) die(`jq filter failed (${bin}): ${r.error?.message ?? r.stderr}`);
  const nl = r.stdout.indexOf("\n");
  return { ms: parseFloat(r.stdout.slice(0, nl)), output: r.stdout.slice(nl + 1) };
}

function demoFor(shot) {
  const files = { [demoFile(shot.file)]: read(shot.file) };
  const jq = {};
  for (const step of shot.steps) if (step.filter) jq[step.filter] = runJq(step.filter, files[demoFile(shot.file)]);
  return { file: demoFile(shot.file), files, jq };
}

// ---- static server for dist/ ------------------------------------------------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
function serve(app) {
  const dist = path.join(ROOT, "apps", app, "dist");
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const demo = url.startsWith("/demo/");
    const root = demo ? demoDir : dist;
    const file = path.join(root, demo ? url.slice(6) : url === "/" ? "index.html" : url);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---- Chrome over the DevTools protocol --------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome() {
  const bin = ["chromium", "google-chrome", "chromium-browser"].find((b) => spawnSync("which", [b]).status === 0);
  if (!bin) die("Chromium or Chrome not found");
  const profile = mkdtempSync(path.join(tmpdir(), "qiew-shots-"));
  const child = spawn(bin, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--lang=en-US", "--no-first-run",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore", env: { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" } });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) die("Chrome did not start");
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  return { child, profile, port };
}

async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
    } else listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  return { send, onEvent: (l) => listeners.push(l), close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

const waitFor = async (cdp, expression, what, timeout = 8000) => {
  for (let t = 0; t < timeout; t += 50) {
    if (await evaluate(cdp, expression)) return;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${what}`);
};

// ---- one image --------------------------------------------------------------
async function take(cdp, base, shot, theme) {
  const view = shot.views?.[theme] ?? THEMES[theme];
  const dark = ["soft-dark", "nord"].includes(view);
  const mock = readFileSync(path.join(HERE, "mock-tauri.js"), "utf8");
  const setup = `window.__DEMO__ = ${JSON.stringify(demoFor(shot))};
try { localStorage.setItem(${JSON.stringify(`${shot.app}.view`)}, ${JSON.stringify(view)}); } catch {}
${mock}`;

  await cdp.send("Page.enable");
  const { identifier } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: setup });
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: shot.width, height: shot.height, deviceScaleFactor: SCALE, mobile: false });
  await cdp.send("Page.navigate", { url: base });
  await waitFor(cdp, `(() => { const d = document.getElementById("doc"); return d && !d.hidden && d.textContent.trim().length > 0 })()`, "the document");

  for (const step of shot.steps) {
    if (step.split) {
      await evaluate(cdp, `document.getElementById("split-btn").click()`);
      await waitFor(cdp, `!document.getElementById("pane-result").hidden`, "the split view");
    } else if (step.filter || step.stylesheet) {
      await evaluate(cdp, `(() => { const e = document.getElementById("editor"); e.value = ${JSON.stringify(step.filter ?? step.stylesheet)}; e.dispatchEvent(new Event("input")); document.getElementById("run-btn").click(); })()`);
      await waitFor(cdp, `document.getElementById("duration").textContent.length > 0 || document.querySelector(".result-error")`, "the result");
    } else if (step.click) {
      await evaluate(cdp, `document.querySelector(${JSON.stringify(step.click)}).click()`);
    }
    await sleep(step.wait ?? 150);
  }

  // No caret, no focus ring, no scrolled-away page.
  await evaluate(cdp, `document.activeElement?.blur(); window.scrollTo(0, 0)`);
  await sleep(300);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  return Buffer.from(data, "base64");
}

// ---- run --------------------------------------------------------------------
const chrome = await launchChrome();
const servers = new Map();
let failed = false;
try {
  const cdp = await connect(chrome.port);
  for (const app of apps) servers.set(app, await serve(app));
  for (const shot of shots) {
    const base = `http://127.0.0.1:${servers.get(shot.app).address().port}/`;
    for (const theme of opt.themes) {
      const png = await take(cdp, base, shot, theme);
      const dir = path.join(opt.out, shot.app);
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${shot.name}-${theme}.png`);
      writeFileSync(file, png);
      console.log(path.relative(ROOT, file));

      if (opt.readme) {
        const images = path.join(ROOT, "apps", shot.app, "docs", "images");
        mkdirSync(images, { recursive: true });
        copyFileSync(file, path.join(images, `${shot.name}-${theme}.png`));
      }
      if (opt.site) {
        const shots = path.join(opt.site, "public", "shots");
        mkdirSync(shots, { recursive: true });
        const webp = path.join(shots, `${shot.name}-${theme}.webp`);
        const r = spawnSync("cwebp", ["-quiet", "-q", "90", file, "-o", webp]);
        if (r.status) die("cwebp failed (apt install webp)");
      }
    }
  }
  cdp.close();
} catch (e) {
  console.error(`shoot: ${e.message}`);
  failed = true;
} finally {
  servers.forEach((s) => s.close());
  chrome.child.kill();
  await sleep(300);
  rmSync(chrome.profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
