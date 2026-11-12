//! State of the viewer window, managed by Tauri (`.manage(Viewer::default())`).

use std::path::Path;
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, WebviewWindow};

use crate::window_layout::{self, Geometry};

/// Quiet period after the last file-system event before re-reading. Editors
/// often write a file in several steps; this collapses them into one render.
const DEBOUNCE: Duration = Duration::from_millis(120);

#[derive(Default)]
pub struct Viewer {
    /// Dropping the watcher stops it, which also ends its debounce thread.
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// File handed over by the OS before the frontend was listening (macOS).
    pending: Mutex<Option<String>>,
    /// Window geometry before a split layout widened it.
    narrow: Mutex<Option<Geometry>>,
}

impl Viewer {
    /// Watches `path` instead of the file watched so far. Whenever it
    /// changes, it is read again with `load` and sent to the frontend as
    /// "file-changed".
    pub fn watch<D, L>(&self, app: &AppHandle, path: &Path, load: L)
    where
        D: Serialize + Clone + Send + 'static,
        L: Fn(&Path) -> Result<D, String> + Send + 'static,
    {
        let mut slot = self.watcher.lock().unwrap();
        *slot = None; // stop the previous watcher first
        *slot = watch(app, path, load)
            .map_err(|e| eprintln!("{}: watcher unavailable: {e}", app.package_info().name))
            .ok();
    }

    /// The file to show at startup: one handed over by the OS (macOS), else
    /// the first non-flag CLI argument (double-click on Linux/Windows).
    pub fn initial_file(&self) -> Option<String> {
        self.pending
            .lock()
            .unwrap()
            .take()
            .or_else(|| std::env::args().skip(1).find(|a| !a.starts_with('-')))
    }

    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub(crate) fn set_pending(&self, path: String) {
        *self.pending.lock().unwrap() = Some(path);
    }

    /// Split layout: stretches the window to the full width of the work
    /// area, or restores the size and position it had before.
    pub fn set_wide(&self, window: &WebviewWindow, wide: bool) {
        let mut narrow = self.narrow.lock().unwrap();
        if wide {
            if narrow.is_none() {
                *narrow = window_layout::widen(window);
            }
        } else if let Some(geometry) = narrow.take() {
            window_layout::restore(window, geometry);
        }
    }
}

/// Watches the parent directory rather than the file itself: editors that save
/// atomically (write temp file, rename over original) replace the inode, which
/// would silently end a watch on the file.
fn watch<D, L>(app: &AppHandle, path: &Path, load: L) -> notify::Result<RecommendedWatcher>
where
    D: Serialize + Clone + Send + 'static,
    L: Fn(&Path) -> Result<D, String> + Send + 'static,
{
    let (tx, rx) = mpsc::channel::<()>();
    let target = path.to_path_buf();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let relevant = matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Any
            );
            if relevant && event.paths.iter().any(|p| p == &target) {
                let _ = tx.send(());
            }
        }
    })?;
    let dir = path.parent().unwrap_or(Path::new("/"));
    watcher.watch(dir, RecursiveMode::NonRecursive)?;

    let app = app.clone();
    let path = path.to_path_buf();
    thread::spawn(move || {
        // Ends when the watcher (and with it `tx`) is dropped.
        while rx.recv().is_ok() {
            while rx.recv_timeout(DEBOUNCE).is_ok() {}
            // A failed read (file briefly missing mid-save) is skipped; the
            // follow-up create/rename event triggers another attempt.
            if let Ok(doc) = load(&path) {
                let _ = app.emit("file-changed", doc);
            }
        }
    });
    Ok(watcher)
}
