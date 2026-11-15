//! The frame the Qiew viewers (Marq, Xaq, Jayq, Trisq) are built on: everything
//! that does not depend on the kind of document shown.
//!
//! - [`Viewer`]: state of the one window – file watcher, the file handed over
//!   at startup, the geometry before a split layout widened the window
//! - [`text`]: reading text files in whatever encoding they come in
//! - [`window_layout`]: initial placement, widening and restoring
//! - [`default_handler`], [`migrate`] (Linux): file association, moving the
//!   directories of an older identifier
//! - [`updates`]: update check of the AppImage
//! - [`about`]: what the About box shows
//! - [`launch`]: the command line every app understands (file, line, placement, reuse)
//! - [`export`]: saving the document in another form, for apps that offer one
//! - [`siblings`]: handing the file shown to another Qiew viewer

pub mod about;
pub mod export;
pub mod help;
pub mod launch;
pub mod siblings;
#[cfg(target_os = "linux")]
pub mod default_handler;
#[cfg(target_os = "linux")]
pub mod migrate;
pub mod text;
pub mod updates;
mod viewer;
pub mod window_layout;

pub use viewer::Viewer;

use std::time::Duration;

use tauri::{App, Manager};

/// What an app is called and which files it opens.
pub struct AppInfo {
    /// Product name, e.g. "Xaq"; also the name of the packaged desktop entry.
    pub name: &'static str,
    /// Binary, icon and window class, e.g. "xaq".
    pub bin: &'static str,
    /// The app's version: `env!("CARGO_PKG_VERSION")`.
    pub version: &'static str,
    /// How to say the name: a word that sounds the same, and the phonetic
    /// spelling (IPA, without slashes).
    pub say: &'static str,
    pub ipa: &'static str,
    /// Desktop entry: `GenericName`, `Comment` and `Categories`.
    pub generic_name: &'static str,
    pub comment: &'static str,
    pub categories: &'static str,
    /// MIME types the app becomes the default for; the first one is checked.
    pub mime_types: &'static [&'static str],
    /// MIME types the app merely offers itself for ("Open with"), without
    /// ever becoming their default.
    pub open_with: &'static [&'static str],
    /// shared-mime-info XML for file types the system does not know by itself
    /// (installed along with a user-local desktop entry; a package ships it).
    pub mime_definition: Option<&'static str>,
    /// The files in words, for dialogs: "XML-Dateien (.xml, .xsd, .xsl …)".
    pub files: &'static str,
    /// The file endings the app is made for, for the About box: `[".xml", ".xsd"]`.
    pub extensions: &'static [&'static str],
    /// What the app can do, one line each, for `--help`.
    pub features: &'static [&'static str],
    /// Further ways to call it, for `--help`: `"trisq <file> --export-html <out.html>"`.
    pub usage: &'static [&'static str],
    /// The app's own options with what they do, for `--help`.
    pub options: &'static [(&'static str, &'static str)],
}

/// Reads the command line (see [`launch`]), answers `--help` and `--version` ([`help`]) and handles `--register-default`
/// (set up the file association without asking, e.g. from a setup script).
/// Returns true if the process should exit.
pub fn handle_cli(info: &AppInfo) -> bool {
    if help::handle(info) {
        return true;
    }
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
    launch::init(info)
}

/// Shows the window anyway if the frontend has not done so by then (see
/// [`Viewer::show`]), e.g. after a script error or while a file is still read
/// from a slow drive.
const SHOW_FALLBACK: Duration = Duration::from_secs(3);

/// To be called from Tauri's `setup`: offers the file association once and
/// looks for an update.
///
/// The window starts hidden; the frontend shows it via [`Viewer::show`] once
/// the colour scheme is applied and the first document rendered, so it
/// appears at its final size and position without flashing the light default
/// or the drop target.
pub fn setup(app: &App, info: &'static AppInfo) {
    app.manage(info);
    launch::listen(app.handle(), info);
    if let Some(window) = app.get_webview_window("main") {
        std::thread::spawn(move || {
            std::thread::sleep(SHOW_FALLBACK);
            window.state::<Viewer>().show(&window);
        });
    }
    #[cfg(target_os = "linux")]
    default_handler::offer(app.handle(), info);
    let _ = info;
    updates::check_in_background(app.handle());
}

/// To be called from Tauri's run loop: tidies up on exit; macOS delivers
/// "Open With…" as an event, not as argv.
pub fn on_run_event(_app: &tauri::AppHandle, _event: &tauri::RunEvent) {
    if let tauri::RunEvent::Exit = _event
        && let Some(info) = _app.try_state::<&'static AppInfo>()
    {
        launch::clean_up(&info);
    }
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
