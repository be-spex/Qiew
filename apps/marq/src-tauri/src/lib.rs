//! Marq – read-only Markdown viewer.
//!
//! Zero-Touch-Policy: this backend never writes to the file system. The only
//! file access is `fs::read_to_string`; the watcher merely observes.

#[cfg(target_os = "linux")]
mod default_handler;
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
    dir: String,
    content: String,
}

#[derive(Default)]
struct ViewerState {
    /// Dropping the watcher stops it, which also ends its debounce thread.
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// File handed over by the OS before the frontend was listening (macOS).
    pending: Mutex<Option<String>>,
}

fn load(path: &Path) -> Result<Document, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(Document {
        path: path.to_string_lossy().into_owned(),
        dir: path
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        content,
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

/// Reads a Markdown file, starts watching it and grants the webview read
/// access to its directory (for relative images).
#[tauri::command]
fn open_file(
    path: String,
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, ViewerState>,
) -> Result<Document, String> {
    let path: PathBuf = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    let doc = load(&path)?;

    if let Some(dir) = path.parent() {
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }

    let mut slot = state.watcher.lock().unwrap();
    *slot = None; // stop the previous watcher first
    *slot = watch(&app, &path)
        .map_err(|e| eprintln!("marq: watcher unavailable: {e}"))
        .ok();

    if let Some(name) = path.file_name() {
        let _ = window.set_title(&format!("{} – Marq", name.to_string_lossy()));
    }
    Ok(doc)
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
    // `marq --register-default`: set up the file association without asking
    // (e.g. from a setup script) and exit.
    #[cfg(target_os = "linux")]
    if std::env::args().any(|a| a == "--register-default") {
        match default_handler::register() {
            Ok(()) => println!("Marq ist jetzt Standard für Markdown-Dateien."),
            Err(e) => {
                eprintln!("marq: {e}");
                std::process::exit(1);
            }
        }
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(ViewerState::default())
        .invoke_handler(tauri::generate_handler![open_file, initial_file])
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
        .expect("error while building Marq")
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
