//! Handing the file shown to another Qiew viewer, e.g. from a diagram in Marq to Maiqe, where it
//! can be zoomed and exported. Only the viewers of this family can be started this way, and only
//! with the file this window shows: the frontend names the viewer and a line, nothing else.

use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use tauri::State;

use crate::Viewer;

/// The binaries a viewer may hand over to.
const VIEWERS: &[&str] = &["marq", "xaq", "jayq", "trisq", "hyqe", "cusq", "dirq", "maiqe"];

/// Where `bin` is installed: the first match on `PATH`.
fn find(bin: &str) -> Option<PathBuf> {
    if !VIEWERS.contains(&bin) {
        return None;
    }
    env::split_paths(&env::var_os("PATH")?).map(|dir| dir.join(bin)).find(|p| p.is_file())
}

/// Whether the viewer `bin` is installed, so that a button for it is worth showing.
#[tauri::command]
pub fn has_viewer(bin: &str) -> bool {
    find(bin).is_some()
}

/// Opens the file this window shows in the viewer `bin`, at `line` if given. The viewer runs on
/// its own: closing this window leaves it open.
#[tauri::command]
pub fn open_in_viewer(bin: &str, line: Option<u32>, viewer: State<'_, Viewer>) -> Result<(), String> {
    let exe = find(bin).ok_or_else(|| format!("{bin} is not installed"))?;
    let file = viewer.current().ok_or("No file is open.")?;
    let mut command = Command::new(exe);
    command.arg(file);
    if let Some(line) = line.filter(|n| *n > 0) {
        command.args(["--line", &line.to_string()]);
    }
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = command.spawn().map_err(|e| format!("{bin}: {e}"))?;
    // Reaped in the background, so no zombie remains while this window stays open.
    std::thread::spawn(move || child.wait());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_qiew_viewers() {
        assert_eq!(find("sh"), None);
        assert_eq!(find("../bin/sh"), None);
    }
}
