//! The jq engine: [jaq](https://github.com/01mf02/jaq), a jq implementation
//! in Rust, so the filter view needs no `jq` on the system.
//!
//! A filter can run forever (`repeat(.)`), recurse until the stack is gone
//! or produce gigabytes. It therefore never runs in the viewer itself but in
//! a worker: the same binary, started as `jayq --jq-worker <filter>` with
//! the JSON on stdin. [`Runner`] starts the worker, ends it after
//! [`TIMEOUT`] or when the next run starts, and caps what it reads.

use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use jaq_core::load::{self, Arena, File, Loader};
use jaq_core::{data, unwrap_valr, Compiler, Ctx, Vars};
use jaq_json::{read, Val};
use serde::Serialize;

pub const WORKER_FLAG: &str = "--jq-worker";
const TIMEOUT: Duration = Duration::from_secs(10);
/// More output than this is not shown.
const MAX_OUTPUT: usize = 64 * 1024 * 1024;

/// Line and column (both from 1) of byte `offset` in `text`.
fn position(text: &str, offset: usize) -> (usize, usize) {
    let before = &text[..offset.min(text.len())];
    let line = before.matches('\n').count() + 1;
    let col = before.rsplit('\n').next().unwrap_or("").chars().count() + 1;
    (line, col)
}

/// "Zeile 2, Spalte 5" of `part`, a slice of `code`.
fn place(code: &str, part: &str) -> String {
    let (line, col) = position(code, load::span(code, part).start);
    format!("Zeile {line}, Spalte {col}")
}

fn load_error(code: &str, error: load::Error<&str>) -> Vec<String> {
    match error {
        load::Error::Io(errors) => errors
            .into_iter()
            .map(|(path, e)| format!("Modul {path} kann nicht geladen werden: {e}"))
            .collect(),
        load::Error::Lex(errors) => errors
            .into_iter()
            .map(|(expected, found)| format!("{}: {} erwartet", place(code, found), expected.as_str()))
            .collect(),
        load::Error::Parse(errors) => errors
            .into_iter()
            .map(|(expected, found)| match found {
                // At the end of the filter there is no token to point at.
                "" => format!("{}: {} erwartet, aber der Filter endet hier", place(code, &code[code.len()..]), expected.as_str()),
                f => format!("{}: {} erwartet, aber „{f}“ gefunden", place(code, f), expected.as_str()),
            })
            .collect(),
    }
}

/// Runs `filter` on every JSON value in `input`; the outputs come back as
/// compact JSON, one value per line.
fn evaluate(filter: &str, input: &str) -> Result<String, String> {
    let defs = jaq_core::defs().chain(jaq_std::defs()).chain(jaq_json::defs());
    let funs = jaq_core::funs().chain(jaq_std::funs()).chain(jaq_json::funs());

    let arena = Arena::default();
    let modules = Loader::new(defs)
        .load(&arena, File { code: filter, path: () })
        .map_err(|errors| {
            errors
                .into_iter()
                .flat_map(|(_file, e)| load_error(filter, e))
                .collect::<Vec<_>>()
                .join("\n")
        })?;
    let compiled = Compiler::default().with_funs(funs).compile(modules).map_err(|errors| {
        errors
            .into_iter()
            .flat_map(|(_file, undefined)| undefined)
            .map(|(name, kind)| format!("{}: {} „{name}“ ist nicht definiert", place(filter, name), kind.as_str()))
            .collect::<Vec<_>>()
            .join("\n")
    })?;

    let mut out = String::new();
    for value in read::parse_many(input.as_bytes()) {
        let value = value.map_err(|e| format!("Eingabe ist kein gültiges JSON ({e})"))?;
        let ctx = Ctx::<data::JustLut<Val>>::new(&compiled.lut, Vars::new([]));
        for result in compiled.id.run((ctx, value)).map(unwrap_valr) {
            let result = result.map_err(|e| format!("Fehler: {e}"))?;
            out.push_str(&result.to_string());
            out.push('\n');
        }
    }
    Ok(out)
}

/// `jayq --jq-worker <filter>`: reads JSON from stdin and prints the time the
/// filter took (ms, first line), then the outputs. An error goes to stderr.
pub fn worker(filter: &str) -> ! {
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        eprintln!("Eingabe nicht lesbar: {e}");
        std::process::exit(2);
    }
    // The viewer ends a worker that takes too long. Should the viewer be gone
    // by then (window closed while a filter runs), the worker ends itself.
    thread::spawn(|| {
        thread::sleep(TIMEOUT + Duration::from_secs(2));
        std::process::exit(3);
    });
    let start = Instant::now();
    match evaluate(filter, &input) {
        Ok(out) => {
            let ms = start.elapsed().as_secs_f64() * 1000.0;
            let mut stdout = std::io::stdout().lock();
            let _ = writeln!(stdout, "{ms}");
            let _ = stdout.write_all(out.as_bytes());
            let _ = stdout.flush();
            std::process::exit(0);
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}

#[derive(Serialize)]
pub struct Outcome {
    /// The outputs as compact JSON, one value per line.
    output: String,
    /// Time the filter took, without starting the worker.
    ms: f64,
}

/// Runs filters in a worker process, one at a time.
#[derive(Default)]
pub struct Runner {
    current: Mutex<Option<(u64, Child)>>,
    runs: AtomicU64,
}

impl Runner {
    /// Ends the worker of run `id`, if it is still the current one.
    fn kill(&self, id: u64) {
        if let Some((current, child)) = self.current.lock().unwrap().as_mut() {
            if *current == id {
                let _ = child.kill();
            }
        }
    }

    pub fn run(&self, filter: &str, source: String) -> Result<Outcome, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut child = Command::new(exe)
            .arg(WORKER_FLAG)
            .arg(filter)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("jq-Prozess konnte nicht gestartet werden: {e}"))?;
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = child.stdout.take().unwrap();
        let mut stderr = child.stderr.take().unwrap();

        // A run that is still going is overtaken by this one.
        let id = self.runs.fetch_add(1, Ordering::Relaxed) + 1;
        if let Some((_, mut old)) = self.current.lock().unwrap().replace((id, child)) {
            let _ = old.kill();
            let _ = old.wait();
        }

        let timed_out = AtomicBool::new(false);
        let mut too_big = false;
        let mut output = Vec::new();
        let mut errors = String::new();
        thread::scope(|scope| {
            scope.spawn(move || {
                let _ = stdin.write_all(source.as_bytes());
            });
            scope.spawn(|| {
                let _ = stderr.read_to_string(&mut errors);
            });
            let (done, finished) = mpsc::channel::<()>();
            let timed_out = &timed_out;
            scope.spawn(move || {
                if finished.recv_timeout(TIMEOUT) == Err(RecvTimeoutError::Timeout) {
                    timed_out.store(true, Ordering::Relaxed);
                    self.kill(id);
                }
            });

            let mut chunk = [0u8; 64 * 1024];
            loop {
                match stdout.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => output.extend_from_slice(&chunk[..n]),
                }
                if output.len() > MAX_OUTPUT {
                    too_big = true;
                    self.kill(id);
                    break;
                }
            }
            drop(done);
        });

        let status = {
            let mut current = self.current.lock().unwrap();
            match current.take() {
                Some((current_id, mut child)) if current_id == id => child.wait().ok(),
                other => {
                    *current = other;
                    return Err("Abgebrochen: ein neuer Lauf wurde gestartet.".into());
                }
            }
        };

        if timed_out.load(Ordering::Relaxed) {
            return Err(format!("Abgebrochen: der Filter lief länger als {} s.", TIMEOUT.as_secs()));
        }
        if too_big {
            return Err(format!("Abgebrochen: das Ergebnis ist größer als {} MB.", MAX_OUTPUT / (1024 * 1024)));
        }
        match status {
            Some(s) if s.success() => {
                let text = String::from_utf8_lossy(&output);
                let (ms, output) = text.split_once('\n').unwrap_or((text.as_ref(), ""));
                Ok(Outcome { ms: ms.trim().parse().unwrap_or(0.0), output: output.to_owned() })
            }
            Some(s) if s.code().is_some() && !errors.trim().is_empty() => Err(errors.trim().to_owned()),
            // Ended by a signal: out of stack or out of memory.
            _ => Err("Der Filter wurde abgebrochen (endlose Rekursion oder zu wenig Speicher?).".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::evaluate;

    #[test]
    fn runs_filters() {
        assert_eq!(evaluate(".", r#"{"a": [1, 2.50, "x"]}"#).unwrap(), "{\"a\":[1,2.50,\"x\"]}\n");
        assert_eq!(evaluate(".a[]", r#"{"a": [1, 2]}"#).unwrap(), "1\n2\n");
        assert_eq!(evaluate("map(.n) | add", r#"[{"n": 1}, {"n": 2}]"#).unwrap(), "3\n");
        assert_eq!(evaluate(".x", "{\"x\": 1}\n{\"x\": 2}\n").unwrap(), "1\n2\n");
        assert_eq!(evaluate("empty", "1").unwrap(), "");
    }

    #[test]
    fn keeps_large_integers() {
        assert_eq!(evaluate(".", "12345678901234567890123").unwrap(), "12345678901234567890123\n");
    }

    #[test]
    fn reports_errors() {
        let e = evaluate(".a |", "1").unwrap_err();
        assert!(e.contains("Zeile 1"), "{e}");
        let e = evaluate("nope", "1").unwrap_err();
        assert!(e.contains("nope") && e.contains("nicht definiert"), "{e}");
        let e = evaluate(".a", "[1]").unwrap_err();
        assert!(e.starts_with("Fehler:"), "{e}");
        let e = evaluate(".", "{oops").unwrap_err();
        assert!(e.contains("kein gültiges JSON"), "{e}");
    }
}
