//! How a viewer is started: the command line every app understands, made so
//! that another program (CodeDeck, a script) can drive a viewer without the
//! viewer knowing about it.
//!
//! ```text
//! <app> [<file> | -] [--line <n>] [--geometry <W>x<H>+<X>+<Y>] [--reuse]
//! ```
//!
//! - `-` reads the document from standard input (`git diff | dirq -`). It is
//!   kept as a file of the app's own in the runtime directory, removed when
//!   the window is closed.
//! - `--line` shows that line of the file once it is open.
//! - `--geometry` places the window: content size and position in physical
//!   pixels, either part may be left out (`900x700`, `+40+60`).
//! - `--reuse` hands the file to a window started with `--reuse` before, if
//!   one is open, instead of opening another. Windows started without it are
//!   left alone.
//!
//! The frontend part is `@qiew/frame/launch`.

use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::{env, fs, io, thread};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

use crate::AppInfo;

/// Options that are followed by a value (which is therefore not the file).
const WITH_VALUE: &[&str] = &["--line", "--geometry", "--export-html"];

/// Where a window is to be: content size and position in physical pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Placement {
    pub size: Option<PhysicalSize<u32>>,
    pub position: Option<PhysicalPosition<i32>>,
}

impl Placement {
    /// `900x700+40+60`, `900x700` or `+40+60` (also `-40`: negative positions).
    pub fn parse(text: &str) -> Option<Self> {
        let at = text.find(['+', '-']).unwrap_or(text.len());
        let (size, position) = text.split_at(at);
        let size = match size {
            "" => None,
            size => {
                let (w, h) = size.split_once(['x', 'X'])?;
                Some(PhysicalSize::new(w.parse().ok().filter(|w| *w > 0)?, h.parse().ok().filter(|h| *h > 0)?))
            }
        };
        let position = match position {
            "" => None,
            position => {
                // Split before the sign of the second number.
                let second = position[1..].find(['+', '-'])? + 1;
                let number = |s: &str| s.strip_prefix('+').unwrap_or(s).parse::<i32>().ok();
                Some(PhysicalPosition::new(number(&position[..second])?, number(&position[second..])?))
            }
        };
        (size.is_some() || position.is_some()).then_some(Self { size, position })
    }
}

/// What the command line asks for.
#[derive(Debug, Default, PartialEq)]
pub struct Launch {
    /// The file to show; `-` has been replaced by the file standard input went to.
    pub file: Option<String>,
    pub line: Option<u32>,
    pub placement: Option<Placement>,
    pub reuse: bool,
}

impl Launch {
    pub fn parse(args: impl IntoIterator<Item = String>) -> Self {
        let mut launch = Self::default();
        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--line" => launch.line = args.next().and_then(|v| v.parse().ok()).filter(|n| *n > 0),
                "--geometry" => launch.placement = args.next().and_then(|v| Placement::parse(&v)),
                "--reuse" => launch.reuse = true,
                "-" if launch.file.is_none() => launch.file = Some(arg),
                flag if WITH_VALUE.contains(&flag) => drop(args.next()),
                flag if flag.starts_with('-') => {}
                _ if launch.file.is_none() => launch.file = Some(arg),
                _ => {}
            }
        }
        launch
    }
}

static LAUNCH: OnceLock<Launch> = OnceLock::new();
/// The line to show in the file that is opened next.
static LINE: Mutex<Option<u32>> = Mutex::new(None);
/// The file standard input was written to, to be removed on exit.
static STDIN_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// The command line of this process.
pub fn get() -> &'static Launch {
    LAUNCH.get_or_init(Launch::default)
}

/// What one viewer tells the one that is already running.
#[derive(Serialize, Deserialize)]
struct Handover {
    file: Option<String>,
    line: Option<u32>,
    geometry: Option<(Option<(u32, u32)>, Option<(i32, i32)>)>,
}

/// The app's own directory for what lives only while it runs.
fn runtime_dir(info: &AppInfo) -> PathBuf {
    env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from).unwrap_or_else(env::temp_dir).join(info.bin)
}

fn socket(info: &AppInfo) -> PathBuf {
    runtime_dir(info).join("reuse.sock")
}

/// Removes files from standard input that a viewer left behind (it was
/// killed rather than closed): those of processes that are gone, a day old –
/// a younger one may still be shown by a viewer it was handed to.
fn sweep(info: &AppInfo) {
    let Ok(entries) = fs::read_dir(runtime_dir(info)) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(pid) = name.strip_prefix("stdin-").and_then(|rest| rest.split('.').next()) else { continue };
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .is_ok_and(|at| at.elapsed().is_ok_and(|age| age.as_secs() > 24 * 60 * 60));
        if old && !std::path::Path::new("/proc").join(pid).exists() {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Standard input as a file the viewer can open like any other.
fn keep_stdin(info: &AppInfo) -> io::Result<PathBuf> {
    let mut content = Vec::new();
    io::stdin().read_to_end(&mut content)?;
    let dir = runtime_dir(info);
    fs::create_dir_all(&dir)?;
    let ending = info.extensions.first().copied().unwrap_or(".txt");
    let file = dir.join(format!("stdin-{}{ending}", std::process::id()));
    fs::write(&file, content)?;
    Ok(file)
}

/// Reads the command line. Returns true if the process is done: the file
/// went to a viewer that is already running (`--reuse`).
pub(crate) fn init(info: &AppInfo) -> bool {
    let mut launch = Launch::parse(env::args().skip(1));
    let mut from_stdin = None;
    sweep(info);
    match launch.file.as_deref() {
        Some("-") => match keep_stdin(info) {
            Ok(file) => {
                launch.file = Some(file.to_string_lossy().into_owned());
                from_stdin = Some(file);
            }
            Err(e) => {
                eprintln!("{}: standard input: {e}", info.bin);
                launch.file = None;
            }
        },
        // Another process, with another working directory, may have to find it.
        Some(file) => {
            if let Ok(absolute) = std::path::absolute(file) {
                launch.file = Some(absolute.to_string_lossy().into_owned());
            }
        }
        None => {}
    }

    if launch.reuse
        && let Ok(mut running) = UnixStream::connect(socket(info))
    {
        let handover = Handover {
            file: launch.file.clone(),
            line: launch.line,
            geometry: launch
                .placement
                .map(|p| (p.size.map(|s| (s.width, s.height)), p.position.map(|p| (p.x, p.y)))),
        };
        if let Ok(message) = serde_json::to_string(&handover)
            && writeln!(running, "{message}").is_ok()
        {
            return true; // a file from standard input stays for the running viewer
        }
    }

    *STDIN_FILE.lock().unwrap() = from_stdin;
    *LINE.lock().unwrap() = launch.line;
    let _ = LAUNCH.set(launch);
    false
}

/// A viewer started with `--reuse` takes the files of later ones: it shows
/// them in its window, placed and raised as asked.
pub(crate) fn listen(app: &AppHandle, info: &AppInfo) {
    if !get().reuse {
        return;
    }
    let path = socket(info);
    let listener = fs::create_dir_all(runtime_dir(info)).and_then(|()| {
        let _ = fs::remove_file(&path); // left behind by a viewer that is gone (nobody answered above)
        UnixListener::bind(&path)
    });
    let listener = match listener {
        Ok(listener) => listener,
        Err(e) => return eprintln!("{}: --reuse unavailable: {e}", info.bin),
    };
    let app = app.clone();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut message = String::new();
            if BufReader::new(stream).read_line(&mut message).is_err() {
                continue;
            }
            let Ok(handover) = serde_json::from_str::<Handover>(&message) else { continue };
            *LINE.lock().unwrap() = handover.line;
            if let Some(window) = app.get_webview_window("main") {
                if let Some((size, position)) = handover.geometry {
                    crate::window_layout::apply(
                        &window,
                        Placement {
                            size: size.map(|(w, h)| PhysicalSize::new(w, h)),
                            position: position.map(|(x, y)| PhysicalPosition::new(x, y)),
                        },
                    );
                }
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            match handover.file {
                Some(file) => drop(app.emit("open-file", file)),
                None => drop(app.emit("reveal-line", ())),
            }
        }
    });
}

/// Removes what this process left in the runtime directory.
pub(crate) fn clean_up(info: &AppInfo) {
    if let Some(file) = STDIN_FILE.lock().unwrap().take() {
        let _ = fs::remove_file(file);
    }
    if get().reuse {
        let _ = fs::remove_file(socket(info));
    }
}

/// The line to show in the file just opened, once.
#[tauri::command]
pub fn take_line() -> Option<u32> {
    LINE.lock().unwrap().take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch(args: &[&str]) -> Launch {
        Launch::parse(args.iter().map(|a| (*a).to_owned()))
    }

    #[test]
    fn finds_the_file_among_the_options() {
        assert_eq!(launch(&["a.md"]).file.as_deref(), Some("a.md"));
        let l = launch(&["--line", "12", "--reuse", "a.md", "--geometry", "900x700+40+60"]);
        assert_eq!((l.file.as_deref(), l.line, l.reuse), (Some("a.md"), Some(12), true));
        assert_eq!(l.placement, Placement::parse("900x700+40+60"));
        // The value of an option is not the file, not even another app's option.
        assert_eq!(launch(&["--export-html", "out.html", "App.tsx"]).file.as_deref(), Some("App.tsx"));
        assert_eq!(launch(&["-", "--line", "3"]).file.as_deref(), Some("-"));
        assert_eq!(launch(&["--register-default"]).file, None);
        assert_eq!(launch(&["a", "--line", "x"]).line, None);
        assert_eq!(launch(&["a", "--line", "0"]).line, None);
    }

    #[test]
    fn reads_size_and_position_also_alone() {
        let both = Placement::parse("900x700+40+60").unwrap();
        assert_eq!(both.size, Some(PhysicalSize::new(900, 700)));
        assert_eq!(both.position, Some(PhysicalPosition::new(40, 60)));
        assert_eq!(Placement::parse("900x700").unwrap().position, None);
        assert_eq!(Placement::parse("+40+60").unwrap().size, None);
        assert_eq!(Placement::parse("800x600-10+0").unwrap().position, Some(PhysicalPosition::new(-10, 0)));
        for wrong in ["", "900", "900x", "x700", "0x700", "900x700+40", "+40", "wide"] {
            assert_eq!(Placement::parse(wrong), None, "{wrong}");
        }
    }
}
