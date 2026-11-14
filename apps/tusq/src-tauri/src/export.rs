//! Export: the component as one HTML file that runs in any browser, without
//! Tusq and (for what comes with Tusq) without a network connection.
//!
//! The file carries every module the component is made of – the component
//! file, what it imports from its project folder, the built-in packages it
//! uses and the runtime that mounts it (the same `host.js` as in the
//! preview, with Tailwind) – as text. A few lines at its start turn each into
//! a module the browser can import and name them in an import map; for that,
//! every import in every module is rewritten to the module's name here
//! (`tusq:…`). Packages that Tusq itself fetches from esm.sh stay links.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use qiew_frame::export::{Exported, Exporter};
use tauri::Manager;

use crate::protocol::{self, BUILT_IN, CDN, Preview, SCRIPTS};
use crate::transpile::{SourceType, patch_imports, transpile};

const HOST: &str = "host.js";

pub fn exporter() -> Exporter {
    Exporter::new("HTML", "html", |app, _| {
        let (entry, root) = app.state::<Preview>().current().ok_or("No file is open.")?;
        let runtime = |name: &str| {
            app.asset_resolver()
                .get(format!("runtime/{name}"))
                .map(|asset| String::from_utf8_lossy(&asset.bytes).into_owned())
        };
        let html = build(&entry, &root, &runtime, app.package_info().version.to_string().as_str())?;
        Ok(Exported { source: entry, content: html.into_bytes() })
    })
}

/// `tusq <file> --export-html <out.html>`: exports without showing a window.
/// Returns the process's exit code if the command line asks for it.
pub fn from_command_line(app: &tauri::AppHandle) -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let at = args.iter().position(|a| a == "--export-html")?;
    let run = || -> Result<PathBuf, String> {
        let out = args.get(at + 1).ok_or("--export-html needs the name of the HTML file to write")?;
        let file = args
            .iter()
            .enumerate()
            .find(|(i, a)| *i != at && *i != at + 1 && !a.starts_with('-'))
            .map(|(_, a)| a)
            .ok_or("which file? usage: tusq <file> --export-html <out.html>")?;
        let entry = fs::canonicalize(file).map_err(|e| format!("{file}: {e}"))?;
        let runtime = |name: &str| {
            app.asset_resolver()
                .get(format!("runtime/{name}"))
                .map(|asset| String::from_utf8_lossy(&asset.bytes).into_owned())
        };
        let html = build(&entry, &protocol::root_of(&entry), &runtime, &app.package_info().version.to_string())?;
        fs::write(out, html).map_err(|e| format!("{out}: {e}"))?;
        Ok(PathBuf::from(out))
    };
    Some(match run() {
        Ok(out) => {
            println!("{}", out.display());
            0
        }
        Err(message) => {
            eprintln!("tusq: {message}");
            1
        }
    })
}

fn runtime_key(file: &str) -> String {
    format!("tusq:/runtime/{file}")
}

fn local_key(file: &Path, root: &Path) -> String {
    let relative = file.strip_prefix(root).unwrap_or(file).to_string_lossy().replace('\\', "/");
    format!("tusq:/files/{}", relative.replace(' ', "%20"))
}

/// What is still to be gathered.
#[derive(Default)]
struct Queue {
    local: Vec<PathBuf>,
    runtime: Vec<String>,
}

/// Builds the HTML file for `entry`. `runtime` hands out a file of the
/// built-in runtime by name.
pub fn build(
    entry: &Path,
    root: &Path,
    runtime: &dyn Fn(&str) -> Option<String>,
    version: &str,
) -> Result<String, String> {
    let mut modules: BTreeMap<String, String> = BTreeMap::new();
    // Always there: the runtime that mounts the component, and what translated JSX calls into
    // (the translation adds that import itself, under its usual name – see `shared`).
    let queue = RefCell::new(Queue {
        local: vec![entry.to_path_buf()],
        runtime: vec![HOST.to_owned(), "react.js".to_owned(), "react-jsx-runtime.js".to_owned()],
    });

    loop {
        let next = queue.borrow_mut().local.pop();
        if let Some(file) = next {
            let key = local_key(&file, root);
            if !modules.contains_key(&key) {
                let source = local_module(&file, root, &queue)?;
                modules.insert(key, source);
            }
            continue;
        }
        let Some(name) = queue.borrow_mut().runtime.pop() else { break };
        let key = runtime_key(&name);
        if modules.contains_key(&key) {
            continue;
        }
        let source = runtime(&name).ok_or_else(|| format!("{name} is missing from the runtime."))?;
        // The runtime's files import each other by relative path.
        let patched = patch_imports(&source, SourceType::mjs(), |specifier| {
            Ok(specifier.strip_prefix("./").map(|file| {
                queue.borrow_mut().runtime.push(file.to_owned());
                runtime_key(file)
            }))
        })
        .map_err(|d| format!("{name}: {}", d.message))?;
        modules.insert(key, patched);
    }

    Ok(page(entry, &local_key(entry, root), &modules, version))
}

/// One file of the project as a module, its imports pointing at the names of
/// the modules in the export.
fn local_module(file: &Path, root: &Path, queue: &RefCell<Queue>) -> Result<String, String> {
    let shown = file.strip_prefix(root).unwrap_or(file).display().to_string();
    let bytes = fs::read(file).map_err(|e| format!("{shown}: {e}"))?;
    let ext = protocol::extension(file).unwrap_or_default();

    if !SCRIPTS.contains(&ext.as_str()) {
        return Ok(match ext.as_str() {
            "css" => protocol::style_module(&shown, &qiew_frame::text::decode(&bytes)),
            "json" => format!("export default {};\n", qiew_frame::text::decode(&bytes)),
            // An image, a font …: its content as a data URL.
            _ => format!(
                "export default \"data:{};base64,{}\";\n",
                protocol::mime(&ext),
                base64::engine::general_purpose::STANDARD.encode(&bytes)
            ),
        });
    }

    let dir = file.parent().unwrap_or(root);
    let local = |target: PathBuf, specifier: &str| -> Result<Option<String>, String> {
        let found = protocol::resolve(&protocol::normalize(&target))
            .and_then(|p| p.canonicalize().ok())
            .ok_or_else(|| format!("Cannot find {specifier} (imported from {shown})"))?;
        if !found.starts_with(root) {
            return Err(format!("{specifier} is outside of {}, the folder Tusq shows files from.", root.display()));
        }
        let key = local_key(&found, root);
        queue.borrow_mut().local.push(found);
        Ok(Some(key))
    };
    let source = qiew_frame::text::decode(&bytes);
    transpile(file, &source, |specifier| {
        let path = specifier.split(['?', '#']).next().unwrap_or(specifier);
        if specifier.starts_with("./") || specifier.starts_with("../") {
            return local(dir.join(path), specifier);
        }
        if let Some(rest) = path.strip_prefix("@/") {
            let src = root.join("src");
            return local(if src.is_dir() { src } else { root.to_path_buf() }.join(rest), specifier);
        }
        if let Some((_, js)) = BUILT_IN.iter().find(|(name, _)| *name == specifier) {
            queue.borrow_mut().runtime.push((*js).to_owned());
            return Ok(Some(runtime_key(js)));
        }
        if specifier.contains(':') {
            return Ok(None); // a URL
        }
        // A package from the network asks for React and ReactDOM by name.
        queue.borrow_mut().runtime.push("react-dom.js".to_owned());
        Ok(Some(format!("{CDN}/{specifier}?external=react,react-dom")))
    })
    .map_err(|d| if d.line > 0 { format!("{shown}:{}:{}\n{}", d.line, d.column, d.message) } else { d.message })
}

/// React under its usual names, for what asks for it that way: translated
/// JSX, and packages loaded from the network, which share the React in the file.
fn shared(modules: &BTreeMap<String, String>) -> Vec<(&'static str, String)> {
    BUILT_IN
        .iter()
        .filter(|(name, _)| name.starts_with("react"))
        .map(|(name, js)| (*name, runtime_key(js)))
        .filter(|(_, key)| modules.contains_key(key))
        .collect()
}

fn page(entry: &Path, entry_key: &str, modules: &BTreeMap<String, String>, version: &str) -> String {
    let name = entry.file_name().unwrap_or_default().to_string_lossy();
    let title = entry.file_stem().unwrap_or_default().to_string_lossy();
    // Inside a script element only "<" needs care; as < it cannot end the element.
    let embed = |value: &serde_json::Value| value.to_string().replace('<', "\\u003c");
    let aliases: serde_json::Map<String, serde_json::Value> =
        shared(modules).into_iter().map(|(name, key)| (name.to_owned(), key.into())).collect();
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Tusq {version}">
<title>{title}</title>
<!-- Exported from {name} with Tusq (https://be-spex.github.io/tusq/): the component and what it needs, in one file. -->
<script type="application/json" id="tusq-modules">{modules}</script>
<script>
// Each module above becomes one the browser can import; the import map names them.
(() => {{
  const sources = JSON.parse(document.getElementById("tusq-modules").textContent);
  const imports = {{}};
  for (const [name, source] of Object.entries(sources)) {{
    imports[name] = URL.createObjectURL(new Blob([source], {{ type: "text/javascript" }}));
  }}
  for (const [name, target] of Object.entries({aliases})) imports[name] = imports[target];
  const map = document.createElement("script");
  map.type = "importmap";
  map.textContent = JSON.stringify({{ imports }});
  document.head.append(map);
  window.__TUSQ_ENTRY__ = {entry};
  window.__TUSQ_FILE__ = {file};
  const host = document.createElement("script");
  host.type = "module";
  host.src = imports[{host}];
  document.head.append(host);
}})();
</script>
</head>
<body><div id="root"></div></body>
</html>
"#,
        title = title.replace('&', "&amp;").replace('<', "&lt;"),
        name = name.replace("--", "- -"),
        modules = embed(&serde_json::json!(modules)),
        aliases = embed(&serde_json::json!(aliases)),
        entry = embed(&entry_key.into()),
        file = embed(&name.as_ref().into()),
        host = embed(&runtime_key(HOST).into()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A stand-in for the built-in runtime: host.js and React with a shared chunk.
    fn runtime(name: &str) -> Option<String> {
        Some(
            match name {
                "host.js" => "import { r } from \"./chunk-a.js\"; import \"./react-dom-client.js\"; r();",
                "react.js" | "react-jsx-runtime.js" | "react-dom.js" | "react-dom-client.js" => "export * from \"./chunk-a.js\";",
                "chunk-a.js" => "export const r = () => 1;",
                _ => return None,
            }
            .to_owned(),
        )
    }

    fn project(files: &[(&str, &str)]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tusq-export-{}-{}", std::process::id(), files.len()));
        let _ = fs::remove_dir_all(&dir);
        for (name, content) in files {
            let path = dir.join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        dir.canonicalize().unwrap()
    }

    #[test]
    fn gathers_the_component_its_files_and_the_runtime_it_uses() {
        let root = project(&[
            ("App.tsx", "import { Card } from './ui/Card';\nimport './theme.css';\nimport data from './data.json';\nimport clsx from 'clsx';\nexport default () => <Card>{data.n}{clsx('a')}</Card>;\n"),
            ("ui/Card.tsx", "import { useState } from 'react';\nexport const Card = (p: { children: unknown }) => <b>{useState(0)[0]}</b>;\n"),
            ("theme.css", "b { color: red }"),
            ("data.json", "{\"n\": 1, \"s\": \"</script>\"}"),
        ]);
        let html = build(&root.join("App.tsx"), &root, &runtime, "1.2.3").unwrap();

        for key in [
            "tusq:/files/App.tsx", "tusq:/files/ui/Card.tsx", "tusq:/files/theme.css", "tusq:/files/data.json",
            "tusq:/runtime/host.js", "tusq:/runtime/react.js", "tusq:/runtime/react-jsx-runtime.js", "tusq:/runtime/chunk-a.js",
        ] {
            assert!(html.contains(&format!("\"{key}\":")), "{key} missing");
        }
        // Imports name modules of the export; a package that is not built in stays a link.
        assert!(html.contains("from \\\"tusq:/files/ui/Card.tsx\\\""), "{html}");
        assert!(html.contains("from \\\"tusq:/runtime/chunk-a.js\\\""), "{html}");
        assert!(html.contains("https://esm.sh/clsx?external=react,react-dom"), "{html}");
        // … which finds the React in the file under its usual name.
        assert!(html.contains("\"react\":\"tusq:/runtime/react.js\""), "{html}");
        assert!(html.contains("\"react/jsx-runtime\":\"tusq:/runtime/react-jsx-runtime.js\""), "{html}");
        assert!(html.contains("\"react-dom\":\"tusq:/runtime/react-dom.js\""), "{html}");
        assert!(html.contains("window.__TUSQ_ENTRY__ = \"tusq:/files/App.tsx\""), "{html}");
        // Nothing in the data can end the script element early.
        assert_eq!(html.matches("</script>").count(), 2, "{html}");
        assert!(html.contains("<title>App</title>") && html.contains("Tusq 1.2.3"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn says_what_is_wrong_instead_of_exporting_something_broken() {
        let root = project(&[("App.tsx", "import x from './gone';\nexport default () => <i>{x}</i>;\n")]);
        let error = build(&root.join("App.tsx"), &root, &runtime, "1").unwrap_err();
        assert!(error.contains("App.tsx:1:15") && error.contains("Cannot find ./gone"), "{error}");
        let _ = fs::remove_dir_all(root);
    }
}
