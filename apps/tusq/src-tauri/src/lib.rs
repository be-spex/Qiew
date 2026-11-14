//! Tusq – read-only viewer for TSX/JSX components.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows. They
//! are only read (and transpiled in memory); the watcher merely observes.
//! The only write is the export, to a path the user picked in the save dialog
//! ([`export`]). As an AppImage, an accepted update replaces the image file.
//!
//! The component runs in a frame of its own origin (`tusq://`, see
//! [`protocol`]), apart from the window with the toolbar and from the
//! commands below.

mod export;
mod protocol;
mod transpile;
mod watch;

use std::fs;
use std::path::PathBuf;

use protocol::Preview;
use qiew_frame::{AppInfo, Viewer};
use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};

static INFO: AppInfo = AppInfo {
    name: "Tusq",
    bin: "tusq",
    say: "Tusk",
    ipa: "tʌsk",
    generic_name: "TSX/JSX Viewer",
    comment: "Read-only viewer for TSX/JSX components",
    categories: "Utility;Viewer;Development;",
    mime_types: &["text/tsx", "text/jsx"],
    open_with: &[],
    // The system knows neither type (and takes *.tsx for a Tiled tileset).
    mime_definition: Some(include_str!("../tusq.xml")),
    files: "TSX-/JSX-Dateien (.tsx, .jsx)",
    extensions: &[".tsx", ".jsx"],
};

#[derive(Clone, Serialize)]
struct Document {
    path: String,
    /// Address of the preview page (without its query).
    url: String,
    /// The source, for "Copy to Clipboard".
    content: String,
}

/// Reads a component file, makes its project directory available to the
/// preview and starts watching.
#[tauri::command]
fn open_file(
    path: String,
    app: AppHandle,
    window: WebviewWindow,
    preview: State<'_, Preview>,
) -> Result<Document, String> {
    let path: PathBuf = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    let content = fs::read(&path)
        .map(|bytes| qiew_frame::text::decode(&bytes))
        .map_err(|e| format!("{}: {e}", path.display()))?;

    preview.open(path.clone(), protocol::root_of(&path));
    preview.watch.start(&app, &path);

    if let Some(name) = path.file_name() {
        let _ = window.set_title(&format!("{} – Tusq", name.to_string_lossy()));
    }
    Ok(Document {
        url: protocol::fs_url(&path),
        path: path.to_string_lossy().into_owned(),
        content,
    })
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

/// The width the component is made for (or a default, if it has none), as
/// measured by the preview; called before the window is shown and for every
/// file opened later.
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Viewer::default())
        .manage(Preview::default())
        .manage(export::exporter())
        .register_uri_scheme_protocol("tusq", |ctx, request| protocol::handle(ctx.app_handle(), &request))
        .invoke_handler(tauri::generate_handler![open_file, initial_file, show_window, fit_width, qiew_frame::about::about_info, qiew_frame::about::open_about_link, qiew_frame::export::export_info, qiew_frame::export::export_file])
        .setup(|app| {
            if let Some(code) = export::from_command_line(app.handle()) {
                std::process::exit(code);
            }
            qiew_frame::setup(app, &INFO);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Tusq")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
