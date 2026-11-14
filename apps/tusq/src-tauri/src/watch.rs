//! Live reload: watches every file the preview has asked for – the entry file
//! and whatever it imports – and tells the frontend when one of them changes.
//!
//! As in the frame's watcher, directories are watched rather than files:
//! editors that save atomically replace the inode, which would silently end
//! a watch on the file itself.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Quiet period after the last event; collapses a save in several steps (and
/// several files written at once) into one reload.
const DEBOUNCE: Duration = Duration::from_millis(120);

#[derive(Default)]
pub struct Watch(Mutex<Option<Active>>);

struct Active {
    /// Dropping the watcher also ends its debounce thread.
    watcher: RecommendedWatcher,
    files: Arc<Mutex<HashSet<PathBuf>>>,
    dirs: HashSet<PathBuf>,
}

impl Watch {
    /// Starts over with `entry` as the only watched file. Every change is
    /// sent to the frontend as "file-changed", with the entry file's current
    /// text (null while it cannot be read).
    pub fn start(&self, app: &AppHandle, entry: &Path) {
        let mut slot = self.0.lock().unwrap();
        *slot = None; // stop the previous watcher first
        *slot = start(app, entry)
            .map_err(|e| eprintln!("tusq: watcher unavailable: {e}"))
            .ok();
        drop(slot);
        self.track(entry);
    }

    /// Adds a file the preview depends on. It need not exist (yet): a module
    /// that was not found is picked up once it appears.
    pub fn track(&self, file: &Path) {
        let mut slot = self.0.lock().unwrap();
        let Some(active) = slot.as_mut() else { return };
        if !active.files.lock().unwrap().insert(file.to_path_buf()) {
            return;
        }
        if let Some(dir) = file.parent()
            && dir.is_dir()
            && active.dirs.insert(dir.to_path_buf())
            && let Err(e) = active.watcher.watch(dir, RecursiveMode::NonRecursive)
        {
            eprintln!("tusq: cannot watch {}: {e}", dir.display());
        }
    }
}

fn start(app: &AppHandle, entry: &Path) -> notify::Result<Active> {
    let (tx, rx) = mpsc::channel::<()>();
    let files = Arc::new(Mutex::new(HashSet::<PathBuf>::new()));

    let watched = files.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let relevant = matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any
            );
            if relevant {
                let watched = watched.lock().unwrap();
                if event.paths.iter().any(|p| watched.contains(p)) {
                    let _ = tx.send(());
                }
            }
        }
    })?;

    let app = app.clone();
    let entry = entry.to_path_buf();
    thread::spawn(move || {
        // Ends when the watcher (and with it `tx`) is dropped.
        while rx.recv().is_ok() {
            while rx.recv_timeout(DEBOUNCE).is_ok() {}
            let _ = app.emit("file-changed", fs::read_to_string(&entry).ok());
        }
    });
    Ok(Active { watcher, files, dirs: HashSet::new() })
}
