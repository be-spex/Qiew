//! The frame the Qiew viewers (Marq, Xaq, Jayq) are built on: everything
//! that does not depend on the kind of document shown.
//!
//! - [`Viewer`]: state of the one window – file watcher, the file handed over
//!   at startup, the geometry before a split layout widened the window
//! - [`text`]: reading text files in whatever encoding they come in
//! - [`window_layout`]: initial placement, widening and restoring
//! - [`default_handler`], [`migrate`] (Linux): file association, moving the
//!   directories of an older identifier
//! - [`updates`]: update check of the AppImage

#[cfg(target_os = "linux")]
pub mod default_handler;
#[cfg(target_os = "linux")]
pub mod migrate;
pub mod text;
pub mod updates;
mod viewer;
pub mod window_layout;

pub use viewer::Viewer;

use tauri::{App, Manager};

/// What an app is called and which files it opens.
pub struct AppInfo {
    /// Product name, e.g. "Xaq"; also the name of the packaged desktop entry.
    pub name: &'static str,
    /// Binary, icon and window class, e.g. "xaq".
    pub bin: &'static str,
    /// Desktop entry: `GenericName`, `Comment` and `Categories`.
    pub generic_name: &'static str,
    pub comment: &'static str,
    pub categories: &'static str,
    /// MIME types the app becomes the default for; the first one is checked.
    pub mime_types: &'static [&'static str],
    /// The files in words, for dialogs: "XML-Dateien (.xml, .xsd, .xsl …)".
    pub files: &'static str,
}

/// Handles `--register-default` (set up the file association without asking,
/// e.g. from a setup script). Returns true if the process should exit.
pub fn handle_cli(info: &AppInfo) -> bool {
    #[cfg(target_os = "linux")]
    if std::env::args().any(|a| a == "--register-default") {
        match default_handler::register(info) {
            Ok(()) => println!("{} ist jetzt Standard für {}.", info.name, info.files),
            Err(e) => {
                eprintln!("{}: {e}", info.bin);
                std::process::exit(1);
            }
        }
        return true;
    }
    let _ = info;
    false
}

/// To be called from Tauri's `setup`: shows the window, offers the file
/// association once and looks for an update.
pub fn setup(app: &App, info: &'static AppInfo) {
    // The window starts hidden so it appears directly at its final size and
    // position.
    if let Some(window) = app.get_webview_window("main") {
        window_layout::place_and_show(&window);
    }
    #[cfg(target_os = "linux")]
    default_handler::offer(app.handle(), info);
    let _ = info;
    updates::check_in_background(app.handle());
}

/// To be called from Tauri's run loop: macOS delivers "Open With…" as an
/// event, not as argv.
pub fn on_run_event(_app: &tauri::AppHandle, _event: &tauri::RunEvent) {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Opened { urls } = _event {
        use tauri::Emitter;
        if let Some(path) = urls.iter().find_map(|u| u.to_file_path().ok()) {
            let path = path.to_string_lossy().into_owned();
            _app.state::<Viewer>().set_pending(path.clone());
            let _ = _app.emit("open-file", path);
        }
    }
}
