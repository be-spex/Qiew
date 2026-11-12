//! Xaq – read-only XML source viewer.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows; the
//! watcher merely observes. The only write is `save_text`, to a path the user
//! picked in the save dialog (the mapping view's "Save Result").

#[cfg(target_os = "linux")]
mod default_handler;
#[cfg(target_os = "linux")]
mod migrate;
mod window_layout;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

/// Quiet period after the last file-system event before re-reading. Editors
/// often write a file in several steps; this collapses them into one render.
const DEBOUNCE: Duration = Duration::from_millis(120);

#[derive(Clone, Serialize)]
struct Document {
    path: String,
    content: String,
}

#[derive(Default)]
struct ViewerState {
    /// Dropping the watcher stops it, which also ends its debounce thread.
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// File handed over by the OS before the frontend was listening (macOS).
    pending: Mutex<Option<String>>,
    /// Window geometry before the mapping layout widened it.
    narrow: Mutex<Option<window_layout::Geometry>>,
}

/// Decodes file contents to text. XML is not always UTF-8: a BOM or the
/// `encoding` pseudo-attribute of the XML declaration tell which charset to use.
fn decode(bytes: &[u8]) -> Result<String, String> {
    if let Some((enc, bom_len)) = encoding_rs::Encoding::for_bom(bytes) {
        return Ok(enc.decode_without_bom_handling(&bytes[bom_len..]).0.into_owned());
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(text.to_owned());
    }
    // Not UTF-8: honour the declared encoding, else assume Windows-1252.
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]);
    let declared = head
        .find("encoding")
        .map(|i| &head[i + "encoding".len()..])
        .and_then(|rest| {
            let rest = rest.trim_start().strip_prefix('=')?.trim_start();
            let quote = rest.chars().next().filter(|c| *c == '"' || *c == '\'')?;
            rest[1..].split(quote).next().map(str::to_owned)
        });
    let enc = declared
        .and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()))
        .unwrap_or(encoding_rs::WINDOWS_1252);
    Ok(enc.decode_without_bom_handling(bytes).0.into_owned())
}

fn load(path: &Path) -> Result<Document, String> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    // NUL bytes never occur in text; this is a binary file, not markup.
    if bytes.contains(&0) && encoding_rs::Encoding::for_bom(&bytes).is_none() {
        return Err(format!("{}: keine Textdatei", path.display()));
    }
    Ok(Document {
        path: path.to_string_lossy().into_owned(),
        content: decode(&bytes)?,
    })
}

/// Watches the parent directory rather than the file itself: editors that save
/// atomically (write temp file, rename over original) replace the inode, which
/// would silently end a watch on the file.
fn watch(app: &AppHandle, path: &Path) -> notify::Result<RecommendedWatcher> {
    let (tx, rx) = mpsc::channel::<()>();
    let target = path.to_path_buf();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let relevant = matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Any
            );
            if relevant && event.paths.iter().any(|p| p == &target) {
                let _ = tx.send(());
            }
        }
    })?;
    let dir = path.parent().unwrap_or(Path::new("/"));
    watcher.watch(dir, RecursiveMode::NonRecursive)?;

    let app = app.clone();
    let path = path.to_path_buf();
    thread::spawn(move || {
        // Ends when the watcher (and with it `tx`) is dropped.
        while rx.recv().is_ok() {
            while rx.recv_timeout(DEBOUNCE).is_ok() {}
            // A failed read (file briefly missing mid-save) is skipped; the
            // follow-up create/rename event triggers another attempt.
            if let Ok(doc) = load(&path) {
                let _ = app.emit("file-changed", doc);
            }
        }
    });
    Ok(watcher)
}

/// Reads a file and starts watching it for changes.
#[tauri::command]
fn open_file(
    path: String,
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, ViewerState>,
) -> Result<Document, String> {
    let path: PathBuf = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    let doc = load(&path)?;

    let mut slot = state.watcher.lock().unwrap();
    *slot = None; // stop the previous watcher first
    *slot = watch(&app, &path)
        .map_err(|e| eprintln!("xaq: watcher unavailable: {e}"))
        .ok();

    if let Some(name) = path.file_name() {
        let _ = window.set_title(&format!("{} – Xaq", name.to_string_lossy()));
    }
    Ok(doc)
}

/// Reads a text file once, without watching it (XSLT for the mapping view).
#[tauri::command]
fn read_text(path: String) -> Result<Document, String> {
    load(Path::new(&path))
}

/// Saves the mapping result to a path the user chose in the save dialog.
#[tauri::command]
fn save_text(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Mapping layout: stretches the window to the full width of the work area,
/// or restores the size and position it had before.
#[tauri::command]
fn set_wide(wide: bool, window: WebviewWindow, state: State<'_, ViewerState>) {
    let mut narrow = state.narrow.lock().unwrap();
    if wide {
        if narrow.is_none() {
            *narrow = window_layout::widen(&window);
        }
    } else if let Some(geometry) = narrow.take() {
        window_layout::restore(&window, geometry);
    }
}

/// The file to show at startup: one handed over by the OS (macOS), else the
/// first non-flag CLI argument (double-click on Linux/Windows).
#[tauri::command]
fn initial_file(state: State<'_, ViewerState>) -> Option<String> {
    state
        .pending
        .lock()
        .unwrap()
        .take()
        .or_else(|| std::env::args().skip(1).find(|a| !a.starts_with('-')))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Identifier until 0.3 (de.lab.xaq, de.lab.xtaq); keeps settings and the colour scheme.
    #[cfg(target_os = "linux")]
    migrate::from_old_identifiers("net.spex.xaq", &["de.lab.xaq", "de.lab.xtaq"]);
    // `xaq --register-default`: set up the file association without asking
    // (e.g. from a setup script) and exit.
    #[cfg(target_os = "linux")]
    if std::env::args().any(|a| a == "--register-default") {
        match default_handler::register() {
            Ok(()) => println!("Xaq ist jetzt Standard für XML-Dateien."),
            Err(e) => {
                eprintln!("xaq: {e}");
                std::process::exit(1);
            }
        }
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(ViewerState::default())
        .invoke_handler(tauri::generate_handler![open_file, initial_file, read_text, save_text, set_wide])
        .setup(|app| {
            // The window starts hidden so it appears directly at its final
            // size and position.
            if let Some(window) = app.get_webview_window("main") {
                window_layout::place_and_show(&window);
            }
            #[cfg(target_os = "linux")]
            default_handler::offer(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Xaq")
        .run(|_app, _event| {
            // macOS delivers "Open With…" as an event, not as argv.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                if let Some(path) = urls.iter().find_map(|u| u.to_file_path().ok()) {
                    let path = path.to_string_lossy().into_owned();
                    *_app.state::<ViewerState>().pending.lock().unwrap() = Some(path.clone());
                    let _ = _app.emit("open-file", path);
                }
            }
        });
}
