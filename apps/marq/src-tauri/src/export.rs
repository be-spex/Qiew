//! Export: the document as rendered, as one HTML file – for readers without
//! a Markdown viewer. The frontend hands over what it shows (the rendered
//! document, the styles and the colour scheme); this side puts the page
//! together and embeds the images that lie next to the Markdown file.

use std::path::Path;

use qiew_frame::Viewer;
use qiew_frame::export::{Exported, Exporter, data_url};
use serde::Deserialize;
use tauri::Manager;

/// What the frontend hands over (`exportContent` in `src/main.ts`).
#[derive(Deserialize)]
struct Rendered {
    /// The rendered document; a local image has `src="qiew-embed:<n>"`.
    html: String,
    css: String,
    /// The colour scheme, as the frame names it.
    view: String,
    /// The local images: the file, and the address as written in the document.
    images: Vec<Image>,
}

#[derive(Deserialize)]
struct Image {
    file: String,
    src: String,
}

pub fn exporter() -> Exporter {
    Exporter::new("HTML", "html", |app, content| {
        let source = app.state::<Viewer>().current().ok_or("No file is open.")?;
        let rendered: Rendered =
            serde_json::from_str(&content.ok_or("Nothing to export.")?).map_err(|e| e.to_string())?;
        Ok(Exported { content: page(&source, rendered).into_bytes(), source })
    })
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('"', "&quot;")
}

fn page(source: &Path, rendered: Rendered) -> String {
    let dir = source.parent().and_then(|d| d.canonicalize().ok());
    let mut html = rendered.html;
    for (n, image) in rendered.images.iter().enumerate() {
        // Only what lies next to the document (the same files the viewer shows) is embedded;
        // anything else keeps the address it has in the document.
        let embedded = Path::new(&image.file)
            .canonicalize()
            .ok()
            .filter(|file| dir.as_ref().is_some_and(|dir| file.starts_with(dir)))
            .and_then(|file| data_url(&file));
        let address = embedded.unwrap_or_else(|| escape(&image.src));
        html = html.replace(&format!("\"qiew-embed:{n}\""), &format!("\"{address}\""));
    }
    let title = source.file_stem().unwrap_or_default().to_string_lossy();
    format!(
        "<!doctype html>\n\
         <html lang=\"en\" data-view=\"{view}\">\n\
         <head>\n\
         <meta charset=\"utf-8\">\n\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
         <meta name=\"generator\" content=\"Marq\">\n\
         <title>{title}</title>\n\
         <style>\n{css}\n</style>\n\
         </head>\n\
         <body>\n\
         <article class=\"markdown-body\">\n{html}\n</article>\n\
         </body>\n\
         </html>\n",
        view = escape(&rendered.view),
        title = escape(&title),
        // Inside a style element only "</" could end it.
        css = rendered.css.replace("</", "<\\/"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn embeds_images_next_to_the_document_and_leaves_the_others() {
        let dir = std::env::temp_dir().join(format!("marq-export-{}", std::process::id()));
        fs::create_dir_all(dir.join("img")).unwrap();
        fs::write(dir.join("img/dot.png"), [0x89, b'P', b'N', b'G']).unwrap();
        let source = dir.join("Notes.md");
        fs::write(&source, "# Notes").unwrap();

        let html = page(
            &source,
            Rendered {
                html: "<h1>Notes</h1><img src=\"qiew-embed:0\"><img src=\"qiew-embed:1\"><img src=\"https://example.org/a.png\">".into(),
                css: "body { margin: 0 }".into(),
                view: "nord".into(),
                images: vec![
                    Image { file: dir.join("img/dot.png").to_string_lossy().into(), src: "img/dot.png".into() },
                    Image { file: "/etc/hostname".into(), src: "../../etc/hostname".into() },
                ],
            },
        );
        assert!(html.contains("<img src=\"data:image/png;base64,iVBORw==\">"), "{html}");
        assert!(html.contains("<img src=\"../../etc/hostname\">"), "{html}");
        assert!(html.contains("https://example.org/a.png"));
        assert!(html.contains("<html lang=\"en\" data-view=\"nord\">") && html.contains("<title>Notes</title>"));
        assert!(html.contains("<article class=\"markdown-body\">\n<h1>Notes</h1>"));
        let _ = fs::remove_dir_all(dir);
    }
}
