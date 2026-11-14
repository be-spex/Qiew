//! Dirq – read-only viewer for diffs and patches. Groundwork: it opens a file, follows it and
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
    name: "Dirq",
    bin: "dirq",
    version: env!("CARGO_PKG_VERSION"),
    say: "Dirk",
    ipa: "dɜːk",
    generic_name: "Diff Viewer",
    comment: "Read-only viewer for diffs and patches",
    categories: "Utility;Viewer;TextTools;Development;",
    mime_types: &["text/x-patch", "text/x-diff"],
    open_with: &[],
    mime_definition: None,
    files: "Diff-Dateien (.diff, .patch)",
    extensions: &[".diff", ".patch"],
    features: &[
        "Shows diffs and patches side by side or unified, with changed words marked.",
        "A header with the patch's subject, author, date, message and totals.",
        "File list with status and +/- counts; F7 / Shift+F7 jump from change to change.",
        "Reads git diff, git format-patch, IntelliJ IDEA patches, Subversion and plain diff -u.",
        "Exports the view as one HTML file.",
    ],
    usage: &["git diff | dirq -"],
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
        let _ = window.set_title(&format!("{} – Dirq", name.to_string_lossy()));
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

/// The width two columns and the file list need; the window takes it (`--geometry` wins).
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
        // The patch as it is shown, in one HTML file (the frontend makes it).
        .manage(
            qiew_frame::export::Exporter::new("HTML", "html", |app, content| {
                let source = app.state::<Viewer>().current().ok_or("No file is open.")?;
                let html = content.filter(|h| !h.is_empty()).ok_or("This is not a patch Dirq can lay out, so there is nothing to export.")?;
                Ok(qiew_frame::export::Exported { source, content: html.into_bytes() })
            })
            .suffix("view"),
        )
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
        .expect("error while building Dirq")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
