//! Registers Xaq as the default application for XML files on Linux
//! desktops that follow the freedesktop.org MIME specs (Cinnamon, KDE, GNOME,
//! XFCE …). The work is delegated to `xdg-mime`, which knows each desktop's
//! quirks; afterwards the result is verified instead of assumed.
//!
//! Only desktop configuration is written (`~/.config/mimeapps.list` via
//! xdg-mime, a user-local `.desktop` entry if needed, a "declined" marker).
//! XML files are never touched.
//!
//! HTML is deliberately not registered: the browser stays its default viewer,
//! Xaq only shows up under "Open with".

use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const MIME_TYPES: &[&str] = &["application/xml", "text/xml", "application/xslt+xml"];
/// Entry installed by the .deb/.rpm package.
const SYSTEM_ENTRY: &str = "Xaq.desktop";
const SYSTEM_EXE: &str = "/usr/bin/xaq";
/// Entry written for AppImage or self-built binaries.
const USER_ENTRY: &str = "xaq.desktop";
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

/// Returns the id of a desktop entry that launches this binary, creating a
/// user-local one when Xaq is not installed as a system package.
fn ensure_desktop_entry() -> io::Result<&'static str> {
    let exe = launch_target()?;
    if exe == Path::new(SYSTEM_EXE) && Path::new("/usr/share/applications").join(SYSTEM_ENTRY).exists() {
        return Ok(SYSTEM_ENTRY);
    }

    let dir = data_home().join("applications");
    fs::create_dir_all(&dir)?;
    let exec = exe.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    let entry = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Xaq\n\
         GenericName=XML Viewer\n\
         Comment=Read-only XML source viewer\n\
         Exec=\"{exec}\" %f\n\
         Icon=xaq\n\
         Terminal=false\n\
         Categories=Utility;Viewer;TextTools;Development;\n\
         MimeType={};\n\
         StartupWMClass=xaq\n",
        MIME_TYPES.join(";")
    );
    fs::write(dir.join(USER_ENTRY), entry)?;
    let _ = Command::new("update-desktop-database").arg(&dir).status();
    Ok(USER_ENTRY)
}

fn current_default(mime: &str) -> Option<String> {
    let out = Command::new("xdg-mime").args(["query", "default", mime]).output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_owned())
}

pub fn is_default() -> bool {
    matches!(current_default(MIME_TYPES[0]).as_deref(), Some(SYSTEM_ENTRY | USER_ENTRY))
}

pub fn register() -> Result<(), String> {
    let id = ensure_desktop_entry().map_err(|e| format!("Desktop-Eintrag: {e}"))?;
    for mime in MIME_TYPES {
        let status = Command::new("xdg-mime")
            .args(["default", id, mime])
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
    if is_default() {
        Ok(())
    } else {
        Err(format!(
            "Zuordnung gesetzt, aber das System meldet weiterhin „{}“. \
             Eventuell überschreibt eine desktop-spezifische mimeapps.list die Einstellung.",
            current_default(MIME_TYPES[0]).unwrap_or_default()
        ))
    }
}

/// Asks once whether Xaq should become the default XML viewer. Runs on
/// a background thread because the dialog blocks until answered.
pub fn offer(app: &AppHandle) {
    if cfg!(debug_assertions) || is_default() {
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
            .message("Soll Xaq XML-Dateien (.xml, .xsd, .xsl …) künftig standardmäßig öffnen?")
            .title("Xaq als Standard festlegen")
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
        if let Err(err) = register() {
            app.dialog()
                .message(err)
                .title("Registrierung fehlgeschlagen")
                .kind(MessageDialogKind::Error)
                .blocking_show();
        }
    });
}
