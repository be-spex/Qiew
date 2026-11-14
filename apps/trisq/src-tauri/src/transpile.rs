//! TypeScript/JSX → plain ES module, in memory, with oxc.
//!
//! Types are stripped, JSX becomes calls into `react/jsx-runtime` (automatic
//! runtime). Import specifiers can be rewritten on the way, which is how
//! style sheets, JSON, images and packages that are not built in find their
//! way to the webview (see `protocol`).

use std::path::Path;

use oxc::allocator::Allocator;
use oxc::ast::ast::Statement;
use oxc::codegen::Codegen;
use oxc::diagnostics::OxcDiagnostic;
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
pub use oxc::span::SourceType;
use oxc::transformer::{TransformOptions, Transformer};

/// What is wrong with a source file, and where.
#[derive(Debug, Clone, PartialEq)]
pub struct Diagnostic {
    pub message: String,
    /// 1-based; 0 if the error has no position.
    pub line: usize,
    pub column: usize,
    /// The lines around the error with a marker under the position.
    pub frame: String,
}

/// Transpiles `source` (the content of `path`). `rewrite` is asked for every
/// static import/export specifier: it may return a replacement, or say why
/// the import cannot work (reported at the place of the import).
pub fn transpile(
    path: &Path,
    source: &str,
    rewrite: impl Fn(&str) -> Result<Option<String>, String>,
) -> Result<String, Diagnostic> {
    // Unknown extensions are read as TSX, the most permissive of the lot.
    let source_type = SourceType::from_path(path).unwrap_or_else(|_| SourceType::tsx());

    // First pass: the specifiers. Second pass: the translation.
    let patched = patch_imports(source, source_type, rewrite)?;

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &patched, source_type).parse();
    if let Some(error) = first_error(parsed.fatal_error, &parsed.diagnostics) {
        return Err(diagnostic(error, &patched));
    }
    let mut program = parsed.program;
    let scoping = SemanticBuilder::new()
        .with_excess_capacity(2.0)
        .with_enum_eval(true)
        .build(&program)
        .semantic
        .into_scoping();
    let transformed = Transformer::new(&allocator, path, &TransformOptions::default())
        .build_with_scoping(scoping, &mut program);
    if let Some(error) = first_error(false, &transformed.diagnostics) {
        return Err(diagnostic(error, &patched));
    }
    Ok(Codegen::new().build(&program).code)
}

/// Replaces static import/export specifiers and changes nothing else; also
/// used on its own for JavaScript that needs no translation. Replacing them
/// in the text (rather than in the syntax tree) keeps this independent of how
/// oxc stores string literals; lines stay where they are.
pub fn patch_imports(
    source: &str,
    source_type: SourceType,
    rewrite: impl Fn(&str) -> Result<Option<String>, String>,
) -> Result<String, Diagnostic> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if let Some(error) = first_error(parsed.fatal_error, &parsed.diagnostics) {
        return Err(diagnostic(error, source));
    }
    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    for statement in &parsed.program.body {
        let literal = match statement {
            Statement::ImportDeclaration(d) => Some(&d.source),
            Statement::ExportAllDeclaration(d) => Some(&d.source),
            Statement::ExportFromDeclaration(d) => Some(&d.source),
            _ => None,
        };
        if let Some(literal) = literal
            && let Some(specifier) = literal.value.as_str()
        {
            let start = literal.span.start as usize;
            let Some(replacement) = rewrite(specifier).map_err(|message| at(message, source, start))? else {
                continue;
            };
            let quoted = serde_json::to_string(&replacement).unwrap_or_default();
            edits.push((start, literal.span.end as usize, quoted));
        }
    }
    let mut text = source.to_owned();
    for (start, end, quoted) in edits.into_iter().rev() {
        text.replace_range(start..end, &quoted);
    }
    Ok(text)
}

fn first_error(panicked: bool, diagnostics: &[OxcDiagnostic]) -> Option<&OxcDiagnostic> {
    diagnostics
        .iter()
        .find(|d| d.severity == oxc::diagnostics::Severity::Error)
        .or_else(|| if panicked { diagnostics.first() } else { None })
}

fn diagnostic(error: &OxcDiagnostic, source: &str) -> Diagnostic {
    let mut message = error.message.to_string();
    if let Some(help) = &error.help {
        message.push('\n');
        message.push_str(help);
    }
    let Some(offset) = error.labels.first().map(|label| (label.offset() as usize).min(source.len())) else {
        return Diagnostic { message, line: 0, column: 0, frame: String::new() };
    };
    at(message, source, offset)
}

fn at(message: String, source: &str, offset: usize) -> Diagnostic {
    let before = &source[..offset];
    let line = before.matches('\n').count() + 1;
    let column = before.rsplit('\n').next().unwrap_or("").chars().count() + 1;
    Diagnostic { message, line, column, frame: frame(source, line, column) }
}

/// Two lines before the error, the line itself with a marker, one after.
fn frame(source: &str, line: usize, column: usize) -> String {
    let first = line.saturating_sub(2).max(1);
    let width = (line + 1).to_string().len();
    let mut out = String::new();
    for (i, text) in source.lines().enumerate().skip(first - 1).take(line + 2 - first) {
        let n = i + 1;
        let text = text.replace('\t', " ");
        out.push_str(&format!("{} {n:>width$} | {text}\n", if n == line { '>' } else { ' ' }));
        if n == line {
            out.push_str(&format!("  {:>width$} | {}^\n", "", " ".repeat(column - 1)));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tsx(source: &str) -> Result<String, Diagnostic> {
        transpile(Path::new("App.tsx"), source, |_| Ok(None))
    }

    #[test]
    fn strips_types_and_compiles_jsx() {
        let js = tsx(
            "import { useState } from 'react';\n\
             interface Props { label: string }\n\
             export default function App({ label }: Props) {\n\
               const [n, setN] = useState<number>(0);\n\
               return <button onClick={() => setN(n + 1)}>{label} {n}</button>;\n\
             }\n",
        )
        .unwrap();
        assert!(js.contains("react/jsx-runtime"), "{js}");
        assert!(js.contains("_jsxs(\"button\""), "{js}");
        assert!(!js.contains("interface"), "{js}");
        assert!(!js.contains("<number>"), "{js}");
        assert!(js.contains("export default function App"), "{js}");
    }

    #[test]
    fn jsx_in_plain_js_and_enums() {
        let js = transpile(Path::new("a.jsx"), "export const A = () => <i/>;", |_| Ok(None)).unwrap();
        assert!(js.contains("_jsx(\"i\""), "{js}");
        let js = transpile(Path::new("a.ts"), "export enum E { A, B }", |_| Ok(None)).unwrap();
        assert!(!js.contains("enum"), "{js}");
    }

    #[test]
    fn rewrites_specifiers_of_imports_and_reexports() {
        let js = transpile(
            Path::new("App.tsx"),
            "import './theme.css';\nimport d3 from 'd3';\nimport React from 'react';\n\
             export * from './a.json';\nexport { x } from \"./x\";\nconsole.log(d3, React);\n",
            |s| {
                Ok(match s {
                    "react" | "./x" => None,
                    s if s.starts_with('.') => Some(format!("{s}?module")),
                    s => Some(format!("https://esm.sh/{s}")),
                })
            },
        )
        .unwrap();
        assert!(js.contains("\"./theme.css?module\""), "{js}");
        assert!(js.contains("\"https://esm.sh/d3\""), "{js}");
        assert!(js.contains("\"./a.json?module\""), "{js}");
        assert!(js.contains("\"react\""), "{js}");
        assert!(js.contains("\"./x\""), "{js}");
    }

    #[test]
    fn reports_an_import_that_cannot_work_where_it_stands() {
        let error = transpile(Path::new("App.tsx"), "import a from './a';\nimport { b } from './gone';\n", |s| {
            if s == "./gone" { Err("Cannot find ./gone".into()) } else { Ok(None) }
        })
        .unwrap_err();
        assert_eq!((error.line, error.column), (2, 19), "{error:?}");
        assert_eq!(error.message, "Cannot find ./gone");
    }

    #[test]
    fn reports_where_the_syntax_error_is() {
        let error = tsx("const a = 1;\nexport default function App() {\n  const b = ;\n  return <div/>;\n}\n").unwrap_err();
        assert_eq!((error.line, error.column), (3, 13), "{error:?}");
        assert!(error.frame.contains("> 3 |   const b = ;\n    |             ^"), "{}", error.frame);
        assert!(!error.message.is_empty());
    }
}
