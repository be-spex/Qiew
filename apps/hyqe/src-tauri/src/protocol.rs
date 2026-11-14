//! `hyqe://localhost/fs/<absolute path>` – what the page frame is made of. Nothing here listens
//! on a port; the webview asks this handler directly. Files are handed out as they are, so
//! relative links, scripts, style sheets and images resolve the way they do on disk.
//!
//! The page runs in a frame of another origin than the app's window: it cannot reach the
//! Tauri commands, and it only gets files below the root directory of the file being shown.
//! It may use the network like any web page.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{AppHandle, Manager};

use crate::watch::Watch;

/// A page is allowed what a page in a browser is allowed, except to reach the app itself.
const CSP: &str = "default-src * hyqe: data: blob: 'unsafe-inline' 'unsafe-eval'; object-src 'none'";

/// Script injected into every HTML page: web links leave for the browser, and the
/// app can ask the page to search itself.
const BRIDGE: &str = r#"<script>(function(){
function tell(m){try{parent.postMessage(m,"*")}catch(e){}}
document.addEventListener("click",function(e){
  var a=e.target&&e.target.closest&&e.target.closest("a[href]");
  if(!a||e.defaultPrevented)return;
  if(/^(https?|mailto):/i.test(a.href)){e.preventDefault();tell({hyqe:"open-url",url:a.href});}
},true);
var open=window.open;window.open=function(u){if(u&&/^https?:/i.test(String(u))){tell({hyqe:"open-url",url:String(u)});}return null;};
window.addEventListener("message",function(e){
  var d=e.data;if(!d||d.hyqe!=="find")return;
  getSelection().removeAllRanges();
  var ok=d.text?window.find(d.text,false,!!d.back,true,false,false,false):false;
  tell({hyqe:"found",ok:ok});
});
document.addEventListener("keydown",function(e){
  if(e.key==="F5"||(e.ctrlKey&&(e.key==="r"||e.key==="R"))){e.preventDefault();tell({hyqe:"reload"});}
  else if(e.ctrlKey&&(e.key==="f"||e.key==="F")){e.preventDefault();tell({hyqe:"search"});}
});
function opaque(c){return c&&c!=="transparent"&&!/^rgba\(.*,\s*0\)$/.test(c);}
function report(){
  var bg=getComputedStyle(document.body).backgroundColor;
  if(!opaque(bg))bg=getComputedStyle(document.documentElement).backgroundColor;
  if(!opaque(bg)){
    // No background of its own: the canvas, which a page that asks for dark gets dark.
    var cs=getComputedStyle(document.documentElement).colorScheme||"";
    var dark=/dark/.test(cs)&&(!/light/.test(cs)||matchMedia("(prefers-color-scheme: dark)").matches);
    bg=dark?"rgb(18, 18, 18)":"rgb(255, 255, 255)";
  }
  tell({hyqe:"page",background:bg,title:document.title});
}
addEventListener("load",report);
})();</script>"#;

const PATH: &AsciiSet = &NON_ALPHANUMERIC.remove(b'/').remove(b'-').remove(b'_').remove(b'.').remove(b'~');

#[derive(Default)]
pub struct Preview {
    /// Files outside this directory are not handed out.
    root: Mutex<Option<PathBuf>>,
    pub watch: Watch,
}

impl Preview {
    pub fn open(&self, root: PathBuf) {
        *self.root.lock().unwrap() = Some(root);
    }
}

/// The directory a page belongs to: the nearest one that looks like a project
/// (so `../css/site.css` works), else the file's own.
pub fn root_of(file: &Path) -> PathBuf {
    let dir = file.parent().unwrap_or(Path::new("/"));
    let home = std::env::var_os("HOME").map(PathBuf::from);
    dir.ancestors()
        .take_while(|d| Some(*d) != home.as_deref() && d.parent().is_some())
        .find(|d| d.join("package.json").is_file() || d.join(".git").exists())
        .unwrap_or(dir)
        .to_path_buf()
}

/// URL of a file as the frame sees it.
pub fn fs_url(file: &Path) -> String {
    let origin = if cfg!(any(windows, target_os = "android")) { "http://hyqe.localhost" } else { "hyqe://localhost" };
    format!("{origin}/fs{}", utf8_percent_encode(&file.to_string_lossy(), PATH))
}

pub fn handle(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let path = percent_decode_str(request.uri().path()).decode_utf8_lossy().into_owned();
    let Some(requested) = path.strip_prefix("/fs").filter(|p| p.starts_with('/')) else {
        return text(StatusCode::NOT_FOUND, "not found");
    };
    let preview = app.state::<Preview>();
    let Some(root) = preview.root.lock().unwrap().clone() else {
        return text(StatusCode::FORBIDDEN, "no file is open");
    };
    let mut requested = PathBuf::from(requested);
    if requested.is_dir() {
        requested = requested.join("index.html");
    }
    preview.watch.track(&requested);
    let Some(found) = requested.canonicalize().ok().filter(|p| p.is_file()) else {
        return text(StatusCode::NOT_FOUND, format!("{}: not found", requested.display()));
    };
    if !found.starts_with(&root) {
        return text(
            StatusCode::FORBIDDEN,
            format!("{} is outside of {}, the folder Hyqe shows files from.", found.display(), root.display()),
        );
    }
    preview.watch.track(&found);
    let bytes = match fs::read(&found) {
        Ok(bytes) => bytes,
        Err(e) => return text(StatusCode::INTERNAL_SERVER_ERROR, format!("{}: {e}", found.display())),
    };
    let ext = found.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if matches!(ext.as_str(), "html" | "htm" | "xhtml") {
        return respond(mime(&ext), inject(&qiew_frame::text::decode(&bytes)).into_bytes());
    }
    respond(mime(&ext), bytes)
}

/// Puts the bridge script at the start of the page's head (after the doctype, so the
/// page keeps its rendering mode).
pub(crate) fn inject(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let at = lower
        .find("<head")
        .and_then(|i| lower[i..].find('>').map(|j| i + j + 1))
        .or_else(|| lower.find("<html").and_then(|i| lower[i..].find('>').map(|j| i + j + 1)))
        .or_else(|| lower.find("<!doctype").and_then(|i| lower[i..].find('>').map(|j| i + j + 1)))
        .unwrap_or(0);
    format!("{}{BRIDGE}{}", &html[..at], &html[at..])
}

fn mime(ext: &str) -> &'static str {
    match ext {
        "html" | "htm" | "xhtml" => "text/html",
        "css" => "text/css",
        "js" | "mjs" => "text/javascript",
        "json" | "map" | "webmanifest" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "wasm" => "application/wasm",
        "txt" | "md" | "csv" => "text/plain",
        _ => "application/octet-stream",
    }
}

fn respond(mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    answer(StatusCode::OK, mime, body)
}

fn answer(status: StatusCode, mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    let text = mime.starts_with("text/") || mime.ends_with("json") || mime.ends_with("javascript");
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, if text { format!("{mime}; charset=utf-8") } else { mime.to_owned() })
        // Files change under the page; it must never see an old one.
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::CONTENT_SECURITY_POLICY, CSP)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap()
}

fn text(status: StatusCode, message: impl Into<String>) -> Response<Vec<u8>> {
    answer(status, "text/plain", message.into().into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_goes_after_the_doctype_and_into_the_head() {
        let out = inject("<!DOCTYPE html>\n<html><head><title>x</title></head><body></body></html>");
        assert!(out.starts_with("<!DOCTYPE html>\n<html><head><script>"), "{out}");
        assert!(out.contains("</script><title>x</title>"));
    }

    #[test]
    fn fragments_get_the_bridge_in_front() {
        assert!(inject("<p>hi</p>").starts_with("<script>"));
    }

    #[test]
    fn urls_keep_paths_readable_and_safe() {
        assert_eq!(fs_url(Path::new("/home/u/My Page/a#b.html")), "hyqe://localhost/fs/home/u/My%20Page/a%23b.html");
    }
}
