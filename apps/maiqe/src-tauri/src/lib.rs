//! Maiqe – read-only viewer for Mermaid diagrams. Groundwork: it opens a file, follows it and
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
    name: "Maiqe",
    bin: "maiqe",
    version: env!("CARGO_PKG_VERSION"),
    say: "MY-kuh",
    ipa: "ˈmaɪkə",
    generic_name: "Mermaid Diagram Viewer",
    comment: "Read-only viewer for Mermaid diagrams",
    categories: "Utility;Viewer;TextTools;Development;",
    mime_types: &["text/vnd.mermaid"],
    open_with: &[],
    mime_definition: Some(include_str!("../maiqe.xml")),
    files: "Mermaid-Dateien (.mmd, .mermaid)",
    extensions: &[".mmd", ".mermaid"],
    features: &[
        "Draws Mermaid diagrams offline: flowcharts, sequence, class and state diagrams and the rest.",
        "Several diagrams in one file, each on a card of its own (also the mermaid blocks of a Markdown file).",
        "Zoom per diagram: buttons, Ctrl+wheel, drag to move, fill the window.",
        "One click (Ctrl+U) switches to the text; errors are shown on the diagram's card.",
        "Saves a diagram as SVG.",
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
        let _ = window.set_title(&format!("{} – Maiqe", name.to_string_lossy()));
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
    if qiew_frame::handle_cli(&INFO) {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Viewer::default())
        // A diagram as SVG (the frontend hands over the one that was drawn).
        .manage(
            qiew_frame::export::Exporter::new("SVG", "svg", |app, content| {
                let source = app.state::<Viewer>().current().ok_or("No file is open.")?;
                let svg = content.filter(|s| !s.is_empty()).ok_or("There is no diagram to export.")?;
                Ok(qiew_frame::export::Exported { source, content: svg.into_bytes() })
            }),
        )
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
        .expect("error while building Maiqe")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
