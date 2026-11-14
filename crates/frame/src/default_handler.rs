//! Registers the app as the default application for its files on Linux
//! desktops that follow the freedesktop.org MIME specs (Cinnamon, KDE, GNOME,
//! XFCE …). The work is delegated to `xdg-mime`, which knows each desktop's
//! quirks; afterwards the result is verified instead of assumed.
//!
//! Every app asks the same way, once: the dialog names the application that
//! opens these files so far, and "no" also means "do not ask again". That
//! answer is the file [`DECLINED_MARKER`] in the app's configuration directory
//! (`~/.config/<identifier>/`); deleting it brings the question back.
//!
//! Only desktop configuration is written (`~/.config/mimeapps.list` via
//! xdg-mime, a user-local `.desktop` entry and MIME definition if needed, the
//! marker). The files themselves are never touched.

use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::AppInfo;

const DECLINED_MARKER: &str = "default-handler-declined";

fn data_home() -> PathBuf {
    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env::var_os("HOME").unwrap_or_default()).join(".local/share"))
}

/// The executable the desktop entry must launch. For an AppImage that is the
/// image itself, not the binary inside its temporary mount.
fn launch_target() -> io::Result<PathBuf> {
    match env::var_os("APPIMAGE") {
        Some(p) => Ok(PathBuf::from(p)),
        None => env::current_exe()?.canonicalize(),
    }
}

/// Entry installed by the .deb package.
fn system_entry(info: &AppInfo) -> String {
    format!("{}.desktop", info.name)
}

/// Entry written for AppImage or self-built binaries.
fn user_entry(info: &AppInfo) -> String {
    format!("{}.desktop", info.bin)
}

/// Returns the id of a desktop entry that launches this binary, creating a
/// user-local one when the app is not installed as a system package.
fn ensure_desktop_entry(info: &AppInfo) -> io::Result<String> {
    let exe = launch_target()?;
    let system = system_entry(info);
    if exe == Path::new("/usr/bin").join(info.bin) && Path::new("/usr/share/applications").join(&system).exists() {
        return Ok(system);
    }

    let dir = data_home().join("applications");
    fs::create_dir_all(&dir)?;
    let exec = exe.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    let entry = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name={name}\n\
         GenericName={generic}\n\
         Comment={comment}\n\
         Exec=\"{exec}\" %f\n\
         Icon={bin}\n\
         Terminal=false\n\
         Categories={categories}\n\
         MimeType={mime};\n\
         StartupWMClass={bin}\n",
        name = info.name,
        generic = info.generic_name,
        comment = info.comment,
        bin = info.bin,
        categories = info.categories,
        mime = [info.mime_types, info.open_with].concat().join(";")
    );
    let user = user_entry(info);
    fs::write(dir.join(&user), entry)?;
    let _ = Command::new("update-desktop-database").arg(&dir).status();

    // File types the system does not know by itself (the package brings the same definition).
    if let Some(definition) = info.mime_definition {
        let mime = data_home().join("mime");
        fs::create_dir_all(mime.join("packages"))?;
        fs::write(mime.join("packages").join(format!("{}.xml", info.bin)), definition)?;
        let _ = Command::new("update-mime-database").arg(&mime).status();
    }
    Ok(user)
}

fn current_default(mime: &str) -> Option<String> {
    let out = Command::new("xdg-mime").args(["query", "default", mime]).output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_owned())
}

/// The name of an installed application, from its desktop entry.
fn app_name(desktop_id: &str) -> Option<String> {
    let system = env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    std::iter::once(data_home())
        .chain(system.split(':').filter(|d| !d.is_empty()).map(PathBuf::from))
        .find_map(|dir| fs::read_to_string(dir.join("applications").join(desktop_id)).ok())?
        .lines()
        .find_map(|line| line.strip_prefix("Name=").map(|name| name.trim().to_owned()))
}

/// The applications that open the app's files so far, by name.
fn replaced(info: &AppInfo) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for mime in info.mime_types {
        let Some(id) = current_default(mime).filter(|id| !id.is_empty()) else { continue };
        if id == system_entry(info) || id == user_entry(info) {
            continue;
        }
        let name = app_name(&id).unwrap_or_else(|| id.trim_end_matches(".desktop").to_owned());
        if !names.contains(&name) {
            names.push(name);
        }
    }
    names
}

/// The question every app asks, with what saying yes replaces.
fn question(info: &AppInfo) -> String {
    let so_far = match replaced(info).as_slice() {
        [] => "Die bisherige Standard-App für diese Dateien wird dadurch ersetzt.".to_owned(),
        names => format!("Bisher ist dafür {} eingestellt; das wird dadurch ersetzt.", names.join(", ")),
    };
    format!("Soll {} {} künftig standardmäßig öffnen?\n\n{so_far}", info.name, info.files)
}

pub fn is_default(info: &AppInfo) -> bool {
    current_default(info.mime_types[0]).is_some_and(|d| d == system_entry(info) || d == user_entry(info))
}

pub fn register(info: &AppInfo) -> Result<(), String> {
    let id = ensure_desktop_entry(info).map_err(|e| format!("Desktop-Eintrag: {e}"))?;
    for mime in info.mime_types {
        let status = Command::new("xdg-mime")
            .args(["default", &id, mime])
            .status()
            .map_err(|e| format!("xdg-mime nicht ausführbar ({e}). Paket xdg-utils installiert?"))?;
        if !status.success() {
            return Err(format!("xdg-mime default {id} {mime} schlug fehl ({status})"));
        }
    }
    // KDE caches MIME associations in ksycoca; refresh whichever version exists.
    for tool in ["kbuildsycoca6", "kbuildsycoca5"] {
        if Command::new(tool).arg("--noincremental").output().is_ok() {
            break;
        }
    }
    if is_default(info) {
        Ok(())
    } else {
        Err(format!(
            "Zuordnung gesetzt, aber das System meldet weiterhin „{}“. \
             Eventuell überschreibt eine desktop-spezifische mimeapps.list die Einstellung.",
            current_default(info.mime_types[0]).unwrap_or_default()
        ))
    }
}

/// Asks once whether the app should become the default for its files. Runs
/// on a background thread because the dialog blocks until answered.
pub fn offer(app: &AppHandle, info: &'static AppInfo) {
    if cfg!(debug_assertions) || is_default(info) {
        return; // never point the system at a dev build
    }
    let Ok(config_dir) = app.path().app_config_dir() else { return };
    let marker = config_dir.join(DECLINED_MARKER);
    if marker.exists() {
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let mut dialog = app
            .dialog()
            .message(question(info))
            .title(format!("{} als Standard festlegen", info.name))
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom("Ja".into(), "Nein, nicht mehr fragen".into()));
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.parent(&window);
        }

        if !dialog.blocking_show() {
            let _ = fs::create_dir_all(&config_dir);
            let _ = fs::write(&marker, b"");
            return;
        }
        if let Err(err) = register(info) {
            app.dialog()
                .message(err)
                .title("Registrierung fehlgeschlagen")
                .kind(MessageDialogKind::Error)
                .blocking_show();
        }
    });
}
