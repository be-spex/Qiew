//! Hyqe – read-only viewer for HTML pages: the page as a browser shows it (scripts, styles and
//! images next to it included), without a browser, and its source one click away.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows. They are only read; the
//! watcher merely observes. As an AppImage, an accepted update replaces the image file.
//!
//! The page runs in a frame of its own origin (`hyqe://`, see [`protocol`]), apart from the
//! window with the toolbar and from the commands below.

mod protocol;
mod watch;

use std::fs;
use std::path::PathBuf;

use protocol::Preview;
use qiew_frame::{AppInfo, Viewer};
use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};

static INFO: AppInfo = AppInfo {
    name: "Hyqe",
    bin: "hyqe",
    version: env!("CARGO_PKG_VERSION"),
    say: "HY-kuh",
    ipa: "ˈhaɪkə",
    generic_name: "HTML Viewer",
    comment: "Read-only viewer for HTML pages",
    categories: "Utility;Viewer;Development;",
    mime_types: &["text/html", "application/xhtml+xml"],
    open_with: &[],
    mime_definition: None,
    files: "HTML-Dateien (.html, .htm)",
    extensions: &[".html", ".htm"],
    features: &[
        "Shows an HTML page as a browser would, with JavaScript and the styles, scripts and images next to it.",
        "One click (Ctrl+U) switches to the coloured source.",
        "Follows the file and every file the page loads; F5 reloads.",
        "Web links open in your browser; the page cannot reach the app or files outside its folder.",
    ],
    usage: &[],
    options: &[],
};

#[derive(Clone, Serialize)]
struct Document {
    path: String,
    /// Address of the page in the frame.
    url: String,
    /// The source, for the source view and "Copy to Clipboard".
    content: String,
}

/// Reads a page, makes its project directory available to the frame and starts watching.
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

    preview.open(protocol::root_of(&path));
    preview.watch.start(&app, &path);

    if let Some(name) = path.file_name() {
        let _ = window.set_title(&format!("{} – Hyqe", name.to_string_lossy()));
    }
    Ok(Document { url: protocol::fs_url(&path), path: path.to_string_lossy().into_owned(), content })
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
        .register_uri_scheme_protocol("hyqe", |ctx, request| protocol::handle(ctx.app_handle(), &request))
        .invoke_handler(tauri::generate_handler![
            open_file,
            initial_file,
            show_window,
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
        .expect("error while building Hyqe")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
