//! Xaq – read-only XML source viewer.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows; the
//! watcher merely observes. The only writes go to a path the user picked in a
//! save dialog: `save_text` (the mapping view's "Save Result") and the export
//! of the formatted document. As an AppImage, an accepted update replaces the
//! image file.

use std::fs;
use std::path::{Path, PathBuf};

use qiew_frame::text::{self, Document};
use qiew_frame::{AppInfo, Viewer};
use tauri::{AppHandle, State, WebviewWindow};

/// HTML is deliberately not among the defaults: the browser stays its default
/// viewer, Xaq only shows up under "Open with". Both lists together are the
/// `MimeType` line of `xaq.desktop`.
static INFO: AppInfo = AppInfo {
    name: "Xaq",
    bin: "xaq",
    say: "Zack",
    ipa: "zæk",
    generic_name: "XML Viewer",
    comment: "Read-only XML source viewer",
    categories: "Utility;Viewer;TextTools;Development;",
    mime_types: &["application/xml", "text/xml", "application/xslt+xml", "application/xsd"],
    open_with: &["application/xhtml+xml", "text/html"],
    mime_definition: None,
    files: "XML-Dateien (.xml, .xsd, .xsl …)",
    extensions: &[".xml", ".wsdl", ".xsd", ".xsl", ".xslt"],
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
        let _ = window.set_title(&format!("{} – Xaq", name.to_string_lossy()));
    }
    Ok(doc)
}

/// Reads a text file once, without watching it (XSLT for the mapping view).
#[tauri::command]
fn read_text(path: String) -> Result<Document, String> {
    text::load(Path::new(&path))
}

/// Saves the mapping result to a path the user chose in the save dialog.
#[tauri::command]
fn save_text(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Mapping layout: stretches the window to the full width of the work area,
/// or restores the size and position it had before.
#[tauri::command]
fn set_wide(wide: bool, window: WebviewWindow, viewer: State<'_, Viewer>) {
    viewer.set_wide(&window, wide);
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
    // Identifier until 0.3 (de.lab.xaq, de.lab.xtaq); keeps settings and the colour scheme.
    #[cfg(target_os = "linux")]
    qiew_frame::migrate::from_old_identifiers("net.spex.xaq", &["de.lab.xaq", "de.lab.xtaq"]);
    if qiew_frame::handle_cli(&INFO) {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Viewer::default())
        .manage(qiew_frame::export::Exporter::formatted("formatted XML"))
        .invoke_handler(tauri::generate_handler![open_file, initial_file, show_window, read_text, save_text, set_wide, qiew_frame::about::about_info, qiew_frame::about::open_about_link, qiew_frame::export::export_info, qiew_frame::export::export_file])
        .setup(|app| {
            qiew_frame::setup(app, &INFO);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Xaq")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
