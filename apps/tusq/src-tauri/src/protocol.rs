//! `tusq://localhost/…` – what the preview frame is made of. Nothing here
//! listens on a port; the webview asks this handler directly.
//!
//! - `/fs/<absolute path>?view` – the page that shows a component file
//! - `/fs/<absolute path>` – a file next to it: scripts are transpiled on the
//!   way, everything else is handed out as it is. Relative imports and
//!   relative `src` attributes therefore resolve the way they do on disk.
//! - `/fs/<absolute path>?module` – a style sheet, JSON file or image the way
//!   an `import` expects it: as a module
//! - `/~/<name>` – the built-in runtime (React, the packages below, Tailwind)
//!
//! The preview is a different origin than the app's own window: it has no
//! access to the Tauri commands, and it only gets files below the root
//! directory of the file being shown.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{AppHandle, Manager};

use crate::transpile::{Diagnostic, transpile};
use crate::watch::Watch;

/// Packages that come with Tusq, by import specifier and runtime file.
pub(crate) const BUILT_IN: &[(&str, &str)] = &[
    ("react", "react.js"),
    ("react/jsx-runtime", "react-jsx-runtime.js"),
    ("react-dom", "react-dom.js"),
    ("react-dom/client", "react-dom-client.js"),
    ("lucide-react", "lucide-react.js"),
    ("recharts", "recharts.js"),
];

/// Everything else is loaded from esm.sh, sharing the built-in React.
pub(crate) const CDN: &str = "https://esm.sh";

pub(crate) const SCRIPTS: &[&str] = &["tsx", "ts", "jsx", "js", "mjs", "mts"];
/// Imports of these become modules (`?module`): a style sheet applies itself,
/// JSON exports its content, the others export their URL.
pub(crate) const ASSETS: &[&str] = &[
    "css", "json", "svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "woff", "woff2", "ttf", "otf",
    "mp3", "wav", "ogg", "mp4", "webm",
];

const CSP: &str = "default-src 'none'; \
    script-src 'self' tusq: 'unsafe-inline' https://esm.sh; \
    style-src 'self' tusq: 'unsafe-inline' https:; \
    img-src 'self' tusq: data: blob: https:; \
    font-src 'self' tusq: data: https:; \
    media-src 'self' tusq: data: blob: https:; \
    connect-src 'self' tusq: https://esm.sh; \
    frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/// Characters of a path that stay as they are in a URL.
const PATH: &AsciiSet = &NON_ALPHANUMERIC.remove(b'/').remove(b'-').remove(b'_').remove(b'.').remove(b'~');

/// State of the preview, managed by Tauri.
#[derive(Default)]
pub struct Preview {
    /// Files outside this directory are not handed out.
    root: Mutex<Option<PathBuf>>,
    /// The file being shown.
    entry: Mutex<Option<PathBuf>>,
    pub watch: Watch,
}

impl Preview {
    pub fn open(&self, entry: PathBuf, root: PathBuf) {
        *self.root.lock().unwrap() = Some(root);
        *self.entry.lock().unwrap() = Some(entry);
    }

    /// The file being shown and the directory it may take files from.
    pub fn current(&self) -> Option<(PathBuf, PathBuf)> {
        Some((self.entry.lock().unwrap().clone()?, self.root.lock().unwrap().clone()?))
    }
}

/// The directory a component file belongs to: the nearest one that looks like
/// a project (so `../lib/x` works), else the file's own.
pub fn root_of(file: &Path) -> PathBuf {
    let dir = file.parent().unwrap_or(Path::new("/"));
    let home = std::env::var_os("HOME").map(PathBuf::from);
    dir.ancestors()
        .take_while(|d| Some(*d) != home.as_deref() && d.parent().is_some())
        .find(|d| d.join("package.json").is_file() || d.join(".git").exists())
        .unwrap_or(dir)
        .to_path_buf()
}

/// URL of a file as the preview sees it.
pub fn fs_url(file: &Path) -> String {
    let origin = if cfg!(any(windows, target_os = "android")) { "http://tusq.localhost" } else { "tusq://localhost" };
    format!("{origin}{}", fs_path(file))
}

fn fs_path(file: &Path) -> String {
    format!("/fs{}", utf8_percent_encode(&file.to_string_lossy(), PATH))
}

pub fn handle(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let path = percent_decode_str(request.uri().path()).decode_utf8_lossy().into_owned();
    let query = request.uri().query().unwrap_or("");
    let param = |name: &str| {
        query.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            (key == name).then_some(value)
        })
    };

    if let Some(name) = path.strip_prefix("/~/") {
        return match app.asset_resolver().get(format!("runtime/{name}")) {
            Some(asset) => respond(StatusCode::OK, &asset.mime_type, asset.bytes),
            None => text(StatusCode::NOT_FOUND, format!("{name}: not part of the runtime")),
        };
    }
    let Some(file) = path.strip_prefix("/fs").filter(|p| p.starts_with('/')) else {
        return text(StatusCode::NOT_FOUND, "not found");
    };
    let preview = app.state::<Preview>();
    let Some(root) = preview.root.lock().unwrap().clone() else {
        return text(StatusCode::FORBIDDEN, "no file is open");
    };
    let requested = PathBuf::from(file);

    if param("view").is_some() {
        return respond(StatusCode::OK, "text/html", page(&requested).into_bytes());
    }

    let is_script = |p: &Path| extension(p).is_none_or(|e| SCRIPTS.contains(&e.as_str()));
    let Some(found) = resolve(&requested).and_then(|p| p.canonicalize().ok()) else {
        if requested.starts_with(&root) {
            track_missing(&preview.watch, &requested);
        }
        let shown = requested.strip_prefix(&root).unwrap_or(&requested).display().to_string();
        return if is_script(&requested) {
            // A missing module: say so, instead of the webview's bare "failed to load".
            script(error_module("Error", &format!("File not found: {shown}"), None))
        } else {
            text(StatusCode::NOT_FOUND, format!("{shown}: not found"))
        };
    };
    if !found.starts_with(&root) {
        let message = format!("{} is outside of {}, the folder Tusq shows files from.", found.display(), root.display());
        return if extension(&found).is_some_and(|e| SCRIPTS.contains(&e.as_str())) {
            script(error_module("Error", &message, None))
        } else {
            text(StatusCode::FORBIDDEN, message)
        };
    }
    preview.watch.track(&found);
    let shown = found.strip_prefix(&root).unwrap_or(&found).display().to_string();

    let bytes = match fs::read(&found) {
        Ok(bytes) => bytes,
        Err(e) => return text(StatusCode::INTERNAL_SERVER_ERROR, format!("{shown}: {e}")),
    };
    let ext = extension(&found).unwrap_or_default();

    if SCRIPTS.contains(&ext.as_str()) {
        let source = qiew_frame::text::decode(&bytes);
        let dir = found.parent().unwrap_or(&root);
        let checked = |specifier: &str| {
            // A relative import that leads nowhere is reported here, with its place in the file;
            // the webview would only say that some binding was not found.
            if specifier.starts_with("./") || specifier.starts_with("../") {
                let target = normalize(&dir.join(specifier.split(['?', '#']).next().unwrap_or(specifier)));
                if resolve(&target).is_none() {
                    track_missing(&preview.watch, &target);
                    return Err(format!("Cannot find {specifier} (imported from {shown})"));
                }
            }
            Ok(rewrite(specifier, &root))
        };
        return script(match transpile(&found, &source, checked) {
            Ok(js) => js,
            Err(d) => error_module("SyntaxError", &d.message.clone(), Some((&shown, &d))),
        });
    }
    if param("module").is_some() {
        let json = |s: &str| serde_json::to_string(s).unwrap_or_default();
        return script(match ext.as_str() {
            "css" => style_module(&shown, &qiew_frame::text::decode(&bytes)),
            "json" => format!("export default {};\n", qiew_frame::text::decode(&bytes)),
            _ => format!("export default {};\n", json(&fs_path(&found))),
        });
    }
    respond(StatusCode::OK, mime(&ext), bytes)
}

/// A style sheet as a module: importing it applies it.
pub(crate) fn style_module(file: &str, css: &str) -> String {
    let json = |s: &str| serde_json::to_string(s).unwrap_or_default();
    format!(
        "const style = document.createElement(\"style\");\n\
         style.dataset.file = {};\n\
         style.textContent = {};\n\
         document.head.append(style);\n\
         export default {{}};\n",
        json(file),
        json(css)
    )
}

pub(crate) fn extension(path: &Path) -> Option<String> {
    path.extension().map(|e| e.to_string_lossy().to_lowercase())
}

/// Finds the file an import means: imports usually leave out the extension,
/// or name a directory with an index file.
pub(crate) fn resolve(requested: &Path) -> Option<PathBuf> {
    if requested.is_file() {
        return Some(requested.to_path_buf());
    }
    let name = requested.file_name()?.to_string_lossy().into_owned();
    SCRIPTS
        .iter()
        .map(|ext| requested.with_file_name(format!("{name}.{ext}")))
        .chain(SCRIPTS.iter().map(|ext| requested.join(format!("index.{ext}"))))
        .find(|candidate| candidate.is_file())
}

/// Watches for a file that does not exist yet, under the names an import could mean.
fn track_missing(watch: &Watch, requested: &Path) {
    watch.track(requested);
    if let Some(name) = requested.file_name().map(|n| n.to_string_lossy().into_owned()) {
        for ext in SCRIPTS {
            watch.track(&requested.with_file_name(format!("{name}.{ext}")));
        }
    }
}

/// Resolves `.` and `..` without asking the file system.
pub(crate) fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

/// Where an import specifier leads, if not where it says.
fn rewrite(specifier: &str, root: &Path) -> Option<String> {
    let as_module = |s: &str| {
        let ext = Path::new(s).extension()?.to_string_lossy().to_lowercase();
        (!s.contains('?') && ASSETS.contains(&ext.as_str())).then(|| format!("{s}?module"))
    };
    if specifier.starts_with("./") || specifier.starts_with("../") || specifier.starts_with('/') {
        return as_module(specifier);
    }
    // The usual alias for the source directory of a project.
    if let Some(rest) = specifier.strip_prefix("@/") {
        let src = root.join("src");
        let target = fs_path(&if src.is_dir() { src } else { root.to_path_buf() }.join(rest));
        return Some(as_module(&target).unwrap_or(target));
    }
    if specifier.contains(':') || BUILT_IN.iter().any(|(name, _)| *name == specifier) {
        return None; // a URL, or a package that comes with Tusq (see the import map)
    }
    Some(format!("{CDN}/{specifier}?external=react,react-dom"))
}

/// A module that fails with this message when it is imported; the runtime
/// shows it (`runtime/host.ts`).
fn error_module(kind: &str, message: &str, at: Option<(&str, &Diagnostic)>) -> String {
    let details = match at {
        Some((file, d)) => serde_json::json!({ "file": file, "line": d.line, "column": d.column, "frame": d.frame }),
        None => serde_json::json!({}),
    };
    format!(
        "const error = new {kind}({});\nerror.tusq = {details};\nthrow error;\n",
        serde_json::to_string(message).unwrap_or_default()
    )
}

/// The page around a component file. The runtime imports the file from the
/// page's own address and mounts what it exports.
fn page(file: &Path) -> String {
    let imports: serde_json::Map<String, serde_json::Value> =
        BUILT_IN.iter().map(|(name, js)| ((*name).to_owned(), format!("/~/{js}").into())).collect();
    let title = file.file_name().unwrap_or_default().to_string_lossy();
    format!(
        "<!doctype html>\n\
         <html lang=\"en\">\n\
         <head>\n\
         <meta charset=\"utf-8\">\n\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
         <title>{title}</title>\n\
         <script type=\"importmap\">{importmap}</script>\n\
         <script type=\"module\" src=\"/~/host.js\"></script>\n\
         </head>\n\
         <body><div id=\"root\"></div></body>\n\
         </html>\n",
        title = title.replace('&', "&amp;").replace('<', "&lt;"),
        importmap = serde_json::json!({ "imports": imports }),
    )
}

pub(crate) fn mime(ext: &str) -> &'static str {
    match ext {
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "txt" | "md" | "csv" => "text/plain",
        _ => "application/octet-stream",
    }
}

fn respond(status: StatusCode, mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    let text = mime.starts_with("text/") || mime.ends_with("json") || mime.ends_with("javascript");
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, if text { format!("{mime}; charset=utf-8") } else { mime.to_owned() })
        // Files change under the preview; it must never see an old one.
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::CONTENT_SECURITY_POLICY, CSP)
        .body(body)
        .unwrap()
}

fn script(js: String) -> Response<Vec<u8>> {
    respond(StatusCode::OK, "text/javascript", js.into_bytes())
}

fn text(status: StatusCode, message: impl Into<String>) -> Response<Vec<u8>> {
    respond(status, "text/plain", message.into().into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_only_what_the_webview_cannot_resolve() {
        let root = Path::new("/nonexistent/project");
        assert_eq!(rewrite("react", root), None);
        assert_eq!(rewrite("react-dom/client", root), None);
        assert_eq!(rewrite("./Child", root), None);
        assert_eq!(rewrite("../lib/util.ts", root), None);
        assert_eq!(rewrite("https://esm.sh/d3", root), None);
        assert_eq!(rewrite("./theme.css", root).as_deref(), Some("./theme.css?module"));
        assert_eq!(rewrite("./logo.SVG", root).as_deref(), Some("./logo.SVG?module"));
        assert_eq!(rewrite("d3", root).as_deref(), Some("https://esm.sh/d3?external=react,react-dom"));
        assert_eq!(
            rewrite("@radix-ui/react-tabs", root).as_deref(),
            Some("https://esm.sh/@radix-ui/react-tabs?external=react,react-dom")
        );
        assert_eq!(rewrite("@/components/Card", root).as_deref(), Some("/fs/nonexistent/project/components/Card"));
        assert_eq!(rewrite("@/data.json", root).as_deref(), Some("/fs/nonexistent/project/data.json?module"));
    }

    #[test]
    fn urls_keep_paths_readable_and_safe() {
        assert_eq!(fs_path(Path::new("/home/u/My App/a#b.tsx")), "/fs/home/u/My%20App/a%23b.tsx");
    }

    #[test]
    fn error_modules_carry_the_position() {
        let d = Diagnostic { message: "Unexpected token".into(), line: 3, column: 7, frame: "> 3 | x\n".into() };
        let js = error_module("SyntaxError", &d.message, Some(("App.tsx", &d)));
        assert!(js.contains("new SyntaxError(\"Unexpected token\")"), "{js}");
        assert!(js.contains("\"line\":3"), "{js}");
    }
}
