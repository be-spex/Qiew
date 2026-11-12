//! Reading text files. Not everything is UTF-8: a BOM or a declared charset
//! (the `encoding` pseudo-attribute of an XML declaration) tell what to use.

use std::fs;
use std::path::Path;

use serde::Serialize;

/// A text file as the frontend gets it.
#[derive(Clone, Serialize)]
pub struct Document {
    pub path: String,
    pub content: String,
}

/// Decodes file contents to text: by BOM, else as UTF-8, else in the charset
/// declared in the first bytes (`encoding="…"`), else as Windows-1252.
pub fn decode(bytes: &[u8]) -> String {
    if let Some((enc, bom_len)) = encoding_rs::Encoding::for_bom(bytes) {
        return enc.decode_without_bom_handling(&bytes[bom_len..]).0.into_owned();
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_owned();
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]);
    let declared = head
        .find("encoding")
        .map(|i| &head[i + "encoding".len()..])
        .and_then(|rest| {
            let rest = rest.trim_start().strip_prefix('=')?.trim_start();
            let quote = rest.chars().next().filter(|c| *c == '"' || *c == '\'')?;
            rest[1..].split(quote).next().map(str::to_owned)
        });
    let enc = declared
        .and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()))
        .unwrap_or(encoding_rs::WINDOWS_1252);
    enc.decode_without_bom_handling(bytes).0.into_owned()
}

/// Reads a text file; binary files are refused.
pub fn load(path: &Path) -> Result<Document, String> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    // NUL bytes never occur in text; this is a binary file, not a document.
    if bytes.contains(&0) && encoding_rs::Encoding::for_bom(&bytes).is_none() {
        return Err(format!("{}: keine Textdatei", path.display()));
    }
    Ok(Document {
        path: path.to_string_lossy().into_owned(),
        content: decode(&bytes),
    })
}
