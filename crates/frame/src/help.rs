//! `--help` (also `-h` and `-?`) and `--version`: what the program is, how it is called and what
//! it can do, on the console. The same for every app; the app contributes its own lines through
//! [`AppInfo`].

use crate::AppInfo;

/// What every viewer understands (see [`crate::launch`]).
const OPTIONS: &[(&str, &str)] = &[
    ("<file>", "the file to show"),
    ("-", "read the document from standard input"),
    ("--line <n>", "show line <n> of the file and mark it for a moment"),
    ("--geometry <W>x<H>+<X>+<Y>", "size and position of the window in pixels; either part may be left out"),
    ("--reuse", "hand the file to a window started with --reuse before, instead of opening another"),
    ("--register-default", "make this the default app for its files, without asking"),
];
const GENERAL: &[(&str, &str)] = &[("-?, -h, --help", "show this help"), ("--version", "show the version")];

/// Prints help or version if the command line asks for it. Returns true if it did.
pub fn handle(info: &AppInfo) -> bool {
    let mut args = std::env::args().skip(1);
    match args.find(|a| matches!(a.as_str(), "--help" | "-h" | "-?" | "--version" | "-V")).as_deref() {
        Some("--version" | "-V") => println!("{} {}", info.bin, info.version),
        Some(_) => print!("{}", text(info)),
        None => return false,
    }
    true
}

/// The help text.
pub fn text(info: &AppInfo) -> String {
    let mut out = format!("{} {} – {}\n", info.name, info.version, info.comment);
    out += &format!("Say \"{}\". Part of Qiew by be spex: small, read-only viewers for Linux.\n", info.say);

    out += &format!("\nUsage:\n  {} [options] [<file> | -]\n", info.bin);
    for usage in info.usage {
        out += &format!("  {usage}\n");
    }

    out += &format!("\nFiles:\n  {}\n", info.extensions.join(", "));

    let rows = || OPTIONS.iter().chain(info.options).chain(GENERAL);
    let width = rows().map(|(name, _)| name.len()).max().unwrap_or(0);
    out += "\nOptions:\n";
    for (name, what) in rows() {
        out += &format!("  {name:width$}  {what}\n");
    }

    out += "\nWhat it does:\n";
    for feature in info.features {
        out += &format!("  - {feature}\n");
    }
    out += "  - Read-only: the file shown is never written to; the view follows it when it changes.\n";

    out += &format!("\nMore: https://be-spex.github.io/{}/\n", info.bin);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn help_names_usage_options_and_features() {
        static INFO: AppInfo = AppInfo {
            name: "Demo",
            bin: "demo",
            version: "1.2.3",
            say: "Demo",
            ipa: "",
            generic_name: "",
            comment: "Read-only viewer for demos",
            categories: "",
            mime_types: &[],
            open_with: &[],
            mime_definition: None,
            files: "",
            extensions: &[".demo", ".dm"],
            features: &["Shows demos."],
            usage: &["demo <file> --export <out>"],
            options: &[("--export <out>", "write the demo to a file")],
        };
        let help = text(&INFO);
        assert!(help.starts_with("Demo 1.2.3 – Read-only viewer for demos\n"), "{help}");
        assert!(help.contains("\n  demo [options] [<file> | -]\n  demo <file> --export <out>\n"), "{help}");
        assert!(help.contains("\n  .demo, .dm\n"), "{help}");
        assert!(help.contains("  --export <out>              write the demo to a file\n"), "{help}");
        assert!(help.contains("  -?, -h, --help              show this help\n"), "{help}");
        assert!(help.contains("  - Shows demos.\n"), "{help}");
    }
}
