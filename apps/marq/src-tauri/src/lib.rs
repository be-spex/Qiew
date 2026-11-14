//! Marq – read-only Markdown viewer.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows; they
//! are only read, the watcher merely observes. The only write is the HTML
//! export, to a path the user picked in the save dialog ([`export`]). As an
//! AppImage, an accepted update replaces the image file.

mod export;

use std::fs;
use std::path::{Path, PathBuf};

use qiew_frame::{AppInfo, Viewer};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};

static INFO: AppInfo = AppInfo {
    name: "Marq",
    bin: "marq",
    say: "Marc",
    ipa: "mɑːk",
    generic_name: "Markdown Viewer",
    comment: "Read-only Markdown viewer",
    categories: "Utility;Viewer;TextTools;",
    mime_types: &["text/markdown", "text/x-markdown"],
    open_with: &[],
    mime_definition: None,
    files: "Markdown-Dateien (.md)",
    extensions: &[".md", ".markdown"],
};

#[derive(Clone, Serialize)]
struct Document {
    path: String,
    dir: String,
    content: String,
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

/// Reads a Markdown file, starts watching it and grants the webview read
/// access to its directory (for relative images).
#[tauri::command]
fn open_file(
    path: String,
    app: AppHandle,
    window: WebviewWindow,
    viewer: State<'_, Viewer>,
) -> Result<Document, String> {
    let path: PathBuf = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    let doc = load(&path)?;

    if let Some(dir) = path.parent() {
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }
    viewer.watch(&app, &path, load);

    if let Some(name) = path.file_name() {
        let _ = window.set_title(&format!("{} – Marq", name.to_string_lossy()));
    }
    Ok(doc)
}

#[tauri::command]
fn initial_file(viewer: State<'_, Viewer>) -> Option<String> {
    viewer.initial_file()
}

/// The frontend is ready to be seen (colour scheme applied, first file shown).
#[tauri::command]
fn show_window(window: WebviewWindow, viewer: State<'_, Viewer>) {
    viewer.show(&window);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Identifier until 0.3 (de.lab.marq); keeps settings and the colour scheme.
    #[cfg(target_os = "linux")]
    qiew_frame::migrate::from_old_identifiers("net.spex.marq", &["de.lab.marq"]);
    if qiew_frame::handle_cli(&INFO) {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Viewer::default())
        .manage(export::exporter())
        .invoke_handler(tauri::generate_handler![open_file, initial_file, show_window, qiew_frame::about::about_info, qiew_frame::about::open_about_link, qiew_frame::export::export_info, qiew_frame::export::export_file])
        .setup(|app| {
            qiew_frame::setup(app, &INFO);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Marq")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
