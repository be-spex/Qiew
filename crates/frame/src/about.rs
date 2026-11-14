//! The About box, the same in every app: name and how to say it, purpose, file endings,
//! whether the app is the default viewer, and two links.
//!
//! Each app lists the two commands in its `invoke_handler`; the frontend part
//! is `@qiew/frame/about`.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::AppInfo;

const WEBSITE: &str = "https://be-spex.github.io";

#[derive(Serialize)]
pub struct About {
    name: &'static str,
    say: &'static str,
    ipa: &'static str,
    version: String,
    purpose: &'static str,
    extensions: &'static [&'static str],
    /// None where the question does not arise (not a freedesktop.org desktop).
    is_default: Option<bool>,
}

#[tauri::command]
pub fn about_info(app: AppHandle, info: State<'_, &'static AppInfo>) -> About {
    #[cfg(target_os = "linux")]
    let is_default = Some(crate::default_handler::is_default(&info));
    #[cfg(not(target_os = "linux"))]
    let is_default = None;
    About {
        name: info.name,
        say: info.say,
        ipa: info.ipa,
        version: app.package_info().version.to_string(),
        purpose: info.comment,
        extensions: info.extensions,
        is_default,
    }
}

/// Opens one of the two links of the About box in the browser. The frontend
/// only names it; the addresses are fixed here.
#[tauri::command]
pub fn open_about_link(link: &str, info: State<'_, &'static AppInfo>) -> Result<(), String> {
    let url = match link {
        "website" => WEBSITE.to_owned(),
        "releases" => format!("https://github.com/be-spex/Qiew/releases?q={}-v", info.bin),
        _ => return Err(format!("unknown link: {link}")),
    };
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}
