//! Cusq – read-only viewer for CSV and TSV tables. Groundwork: it opens a file, follows it and
//! hands its text to the frontend; what the app is to become is in README.md.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows; they
//! are only read, the watcher merely observes. As an AppImage, an accepted
//! update replaces the image file.

use std::fs;
use std::path::PathBuf;

use qiew_frame::text::{self, Document};
use qiew_frame::{AppInfo, Viewer};
use tauri::{AppHandle, Manager, State, WebviewWindow};

static INFO: AppInfo = AppInfo {
    name: "Cusq",
    bin: "cusq",
    version: env!("CARGO_PKG_VERSION"),
    say: "Cask",
    ipa: "kɑːsk",
    generic_name: "CSV Viewer",
    comment: "Read-only viewer for CSV and TSV tables",
    categories: "Utility;Viewer;TextTools;Development;",
    mime_types: &["text/csv", "text/tab-separated-values"],
    open_with: &[],
    mime_definition: None,
    files: "CSV-Dateien (.csv, .tsv)",
    extensions: &[".csv", ".tsv"],
    features: &[
        "Shows CSV and TSV files as a table; comma, semicolon, tab or pipe are detected.",
        "Sort by clicking a heading; filter every column (text, =exact, !not, >5, <=10, /regex/).",
        "Full text search over all cells (Ctrl+F).",
        "Numbers are right-aligned and formatted, dates shown in your language and sorted by time.",
        "Exports the table as shown (filtered, sorted) as CSV.",
    ],
    usage: &[],
    options: &[],
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
        let _ = window.set_title(&format!("{} – Cusq", name.to_string_lossy()));
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

/// The width the table needs; the window takes it (see `Viewer::set_width`: `--geometry` wins).
#[tauri::command]
fn fit_width(width: f64, window: WebviewWindow, viewer: State<'_, Viewer>) {
    viewer.set_width(&window, width.clamp(480.0, 4000.0));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if qiew_frame::handle_cli(&INFO) {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Viewer::default())
        // The table as it is shown: filtered, sorted, with the header row (the frontend makes the text).
        .manage(qiew_frame::export::Exporter::new("CSV (as shown)", "csv", |app, content| {
            let source = app.state::<Viewer>().current().ok_or("No file is open.")?;
            let text = content.ok_or("There is nothing to export.")?;
            Ok(qiew_frame::export::Exported { source, content: text.into_bytes() })
        }).suffix("view"))
        .invoke_handler(tauri::generate_handler![
            open_file,
            initial_file,
            show_window,
            fit_width,
            qiew_frame::about::about_info,
            qiew_frame::about::open_about_link,
            qiew_frame::export::export_info,
            qiew_frame::export::export_file,
            qiew_frame::launch::take_line
        ])
        .setup(|app| {
            qiew_frame::setup(app, &INFO);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Cusq")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
