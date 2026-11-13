// Stand-in for the Tauri runtime, so the real frontends of Marq, Xaq and Jayq
// run in a plain headless Chrome. shoot.mjs injects it before the page
// scripts, together with window.__DEMO__:
//   { file: "/demo/stations.json", files: { path: text }, jq: { filter: {output, ms} } }
;(() => {
  const demo = window.__DEMO__
  const callbacks = new Map()
  let nextId = 1

  const commands = {
    initial_file: () => demo.file ?? null,
    open_file: ({ path }) => {
      const content = demo.files[path]
      if (content === undefined) throw new Error(`demo file not found: ${path}`)
      return { path, dir: path.replace(/\/[^/]*$/, ''), content }
    },
    read_text: ({ path }) => ({ path, content: demo.files[path] ?? '' }),
    save_text: () => null,
    set_wide: () => null,
    run_jq: ({ filter }) => {
      const hit = demo.jq[filter]
      if (!hit) throw new Error(`no demo result for filter: ${filter}`)
      return hit
    },
  }

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main', windowLabel: 'main' },
    },
    transformCallback(cb) {
      const id = nextId++
      callbacks.set(id, cb)
      return id
    },
    unregisterCallback: (id) => callbacks.delete(id),
    convertFileSrc: (path) => path,
    async invoke(cmd, args = {}) {
      if (cmd in commands) return commands[cmd](args)
      // plugin:event|listen, plugin:window|set_theme, clipboard, dialog …
      return cmd === 'plugin:event|listen' ? nextId++ : null
    },
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
})()
