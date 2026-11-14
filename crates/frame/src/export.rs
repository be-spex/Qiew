//! Export, the same in every app: a button in the toolbar, the save dialog,
//! writing the file. What is exported is the app's business – it registers an
//! [`Exporter`] (`.manage(Exporter::new(…))`); an app without one has no
//! button. The frontend part is `@qiew/frame/export`.
//!
//! The dialog is shown here rather than by the frontend, so the only file
//! ever written is the one the user named.

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::Viewer;

/// What an export hands over: where the document lives (the dialog starts
/// there, with the same name and the export's ending) and the file's content.
pub struct Exported {
    pub source: PathBuf,
    pub content: Vec<u8>,
}

type Make = dyn Fn(&AppHandle, Option<String>) -> Result<Exported, String> + Send + Sync;

/// An app's export: what it is called and how it is made.
pub struct Exporter {
    /// The format in words, for the button and the dialog: "HTML".
    label: &'static str,
    /// File ending without the dot: "html". None: that of the document.
    extension: Option<&'static str>,
    /// Added to the document's name, so the export does not ask to replace
    /// it: "formatted" turns data.json into data-formatted.json.
    suffix: Option<&'static str>,
    make: Box<Make>,
}

impl Exporter {
    /// `make` builds the export of the document that is open. It is given
    /// what the frontend handed over, if the app's frontend contributes
    /// (e.g. a rendered view); see `setExportContent` in `@qiew/frame/export`.
    pub fn new(
        label: &'static str,
        extension: &'static str,
        make: impl Fn(&AppHandle, Option<String>) -> Result<Exported, String> + Send + Sync + 'static,
    ) -> Self {
        Self { label, extension: Some(extension), suffix: None, make: Box::new(make) }
    }

    /// The export of the source viewers: the document as they show it –
    /// re-indented – as text of the same kind. The frontend hands over the
    /// text (it is what "Copy" copies); the backend part is the file
    /// [`Viewer`] watches. `label` e.g. "formatted JSON".
    pub fn formatted(label: &'static str) -> Self {
        Self {
            label,
            extension: None,
            suffix: Some("formatted"),
            make: Box::new(|app, content| {
                let source = app.state::<Viewer>().current().ok_or("No file is open.")?;
                let mut text = content
                    .filter(|text| !text.is_empty())
                    .ok_or("The file cannot be read as what it should be, so there is nothing to format.")?;
                if !text.ends_with('\n') {
                    text.push('\n');
                }
                Ok(Exported { source, content: text.into_bytes() })
            }),
        }
    }

    /// Name and ending the save dialog starts with.
    fn target(&self, source: &Path) -> (String, String) {
        let extension = match self.extension {
            Some(extension) => extension.to_owned(),
            None => source.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default(),
        };
        let mut name = source.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        if let Some(suffix) = self.suffix {
            name = format!("{name}-{suffix}");
        }
        if !extension.is_empty() {
            name = format!("{name}.{extension}");
        }
        (name, extension)
    }
}

/// A file as a `data:` URL, for exports that carry their images with them.
/// None if it cannot be read.
pub fn data_url(file: &Path) -> Option<String> {
    let mime = match file.extension()?.to_string_lossy().to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => return None,
    };
    let bytes = fs::read(file).ok()?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[derive(Serialize)]
pub struct ExportInfo {
    label: &'static str,
}

/// The app's export, if it has one.
#[tauri::command]
pub fn export_info(app: AppHandle) -> Option<ExportInfo> {
    let exporter = app.try_state::<Exporter>()?;
    Some(ExportInfo { label: exporter.label })
}

/// Builds the export, asks where to save it and writes it. Returns the path,
/// or None if the user cancelled. Failures are shown in a dialog.
#[tauri::command(async)]
pub fn export_file(content: Option<String>, app: AppHandle, window: WebviewWindow) -> Result<Option<String>, String> {
    let exporter = app.try_state::<Exporter>().ok_or("this app has no export")?;
    let result = (|| {
        let exported = (exporter.make)(&app, content)?;
        let (name, extension) = exporter.target(&exported.source);
        let mut dialog = app
            .dialog()
            .file()
            .set_title(format!("Export as {}", exporter.label))
            .set_file_name(name)
            .set_parent(&window);
        if !extension.is_empty() {
            dialog = dialog.add_filter(exporter.label, &[extension.as_str()]);
        }
        if let Some(dir) = exported.source.parent() {
            dialog = dialog.set_directory(dir);
        }
        let Some(target) = dialog.blocking_save_file() else { return Ok(None) };
        let target = target.into_path().map_err(|e| e.to_string())?;
        // A viewer never writes to the file it shows, not even when asked to.
        if target.canonicalize().is_ok_and(|t| exported.source.canonicalize().is_ok_and(|s| s == t)) {
            return Err(format!("{} is the file being shown. Please choose another name.", target.display()));
        }
        fs::write(&target, exported.content).map_err(|e| format!("{}: {e}", target.display()))?;
        Ok(Some(target.to_string_lossy().into_owned()))
    })();
    if let Err(message) = &result {
        app.dialog()
            .message(message)
            .title(format!("Export as {} failed", exporter.label))
            .kind(MessageDialogKind::Error)
            .parent(&window)
            .blocking_show();
    }
    result
}
