//! Jayq – read-only JSON source viewer with a jq filter view.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows; the
//! watcher merely observes. The only write is `save_text`, to a path the user
//! picked in the save dialog (the filter view's "Save Result"). As an
//! AppImage, an accepted update replaces the image file.

mod jq;

use std::fs;
use std::path::{Path, PathBuf};

use qiew_frame::text::{self, Document};
use qiew_frame::{AppInfo, Viewer};
use tauri::{AppHandle, State, WebviewWindow};

static INFO: AppInfo = AppInfo {
    name: "Jayq",
    bin: "jayq",
    generic_name: "JSON Viewer",
    comment: "Read-only JSON source viewer with jq filters",
    categories: "Utility;Viewer;TextTools;Development;",
    mime_types: &["application/json", "application/x-ndjson", "application/geo+json"],
    files: "JSON-Dateien (.json, .jsonl, .geojson …)",
};

/// Reads a file and starts watching it for changes.
#[tauri::command]
fn open_file(
    path: String,
    app: AppHandle,
    window: WebviewWindow,
    viewer: State<'_, Viewer>,
) -> Result<Document, String> {
    let path: PathBuf = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    let doc = text::load(&path)?;
    viewer.watch(&app, &path, text::load);

    if let Some(name) = path.file_name() {
        let _ = window.set_title(&format!("{} – Jayq", name.to_string_lossy()));
    }
    Ok(doc)
}

/// Reads a text file once, without watching it (a jq file for the filter view).
#[tauri::command]
fn read_text(path: String) -> Result<Document, String> {
    text::load(Path::new(&path))
}

/// Saves the filter result to a path the user chose in the save dialog.
#[tauri::command]
fn save_text(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Filter layout: stretches the window to the full width of the work area,
/// or restores the size and position it had before.
#[tauri::command]
fn set_wide(wide: bool, window: WebviewWindow, viewer: State<'_, Viewer>) {
    viewer.set_wide(&window, wide);
}

#[tauri::command]
fn initial_file(viewer: State<'_, Viewer>) -> Option<String> {
    viewer.initial_file()
}

/// Runs a jq filter over the JSON text. Not on the main thread: it waits for
/// the worker process.
#[tauri::command(async)]
fn run_jq(source: String, filter: String, runner: State<'_, jq::Runner>) -> Result<jq::Outcome, String> {
    runner.run(&filter, source)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() == Some(jq::WORKER_FLAG) {
        jq::worker(&args.next().unwrap_or_default());
    }
    if qiew_frame::handle_cli(&INFO) {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Viewer::default())
        .manage(jq::Runner::default())
        .invoke_handler(tauri::generate_handler![open_file, initial_file, read_text, save_text, set_wide, run_jq])
        .setup(|app| {
            qiew_frame::setup(app, &INFO);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Jayq")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
