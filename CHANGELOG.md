# Changelog

All notable changes to `carve-grammars` are documented here.

## 0.1.2 - Unreleased

### Changed
- Symbol shortcodes match the refined parser shape (carve#261): the first
  name character may be `+` or `-` (so `:+1:` / `:-1:` tokenize), and a
  left word-boundary guard keeps a colon glued to a word (`word:+1:`) from
  opening a symbol. TextMate, Prism and highlight.js updated together.

### Added
- TextMate: `:name:` symbol shortcodes (e.g. emoji) tokenize
  (`constant.language.symbol` name, `punctuation.definition.symbol` colons),
  mirroring the parser shape (name starts alphanumeric, then word chars,
  `+` or `-`).
- TextMate: reference-link definition lines (`[r]: url "Title"`) tokenize as
  `meta.link.reference.def` with label/url/title scopes; citation (`[@k]:`)
  and footnote (`[^f]:`) definition lines are excluded.
- highlight.js: `:name:` symbol shortcodes produce a `symbol` span.
- Shiki kit: light/dark token colors for the symbol scopes.

### Changed
- **BREAKING (follows carve #259): no bare superscript/subscript.** `^text^` and
  `,text,` are literal text; sup/sub are the braced `{^text^}` / `{,text,}` only.
  TextMate, Prism, highlight.js grammars drop their bare sup/sub patterns; the
  Tiptap serializer always emits the braced forms.
- Prism: the former `emoji` token is now `symbol` and matches the parser
  shape exactly (a leading `+` or `_` in the name no longer tokenizes;
  `:+1:` stays literal).
- Tiptap serializer emits bare `=highlight=` at word boundaries
  (brace form stays for intraword), and the canonical `::: tab [Label]` opener
  instead of a `{label="..."}` attribute line (kept as fallback for labels
  containing `]`).
- `carveTab` ingest lifts the `[label]` opener's rendered `div-label` paragraph
  into the label attribute, so canonical tabs round-trip through the editor.

### Fixed
- `carveDelete` / `carveInsert` outrank StarterKit's Strike for `<del>` parsing;
  `{-...-}` no longer degrades to `~...~` after an HTML round-trip.

## 0.1.1 - 2026-07-12

### Added
- Shiki kit: inline emphasis delimiters (`*` `/` `_` `~` `^` `,` `=`) render
  muted gray like code backticks; the content carries the styling.
- TextMate: word-boundary guards on bare `*bold*`, `~strike~` and `^sup^` so
  intraword delimiters stay literal per spec (matching italic/underline/highlight).
- Full TextMate sweep test (67 positive + 6 intraword-negative cases via Shiki)
  runs in CI.
- `carve-grammars/shiki`: shared Shiki/VitePress kit (grammar + GitHub themes
  extended with Carve scope colors + styling transformer + companion CSS), so
  all Carve docs sites configure highlighting from one import.
- TextMate grammar shipped in the npm package (`textmate/carve.tmLanguage.json`).
- TextMate: bare subscript (`,text,`), brace superscript (`{^text^}`) and brace
  highlight (`{=text=}`) forms; inline/display math (`$` + backtick), inline
  footnotes (`^[...]`), cross-references (`</#id>`), hard breaks, definition
  lists, the full task-state set (`[-] [_] [>] [?]`), fence info strings
  (`"Title"` / `[Label]` / `=format`), and table alignment glyphs (`|=>`,
  glued `|<` overrides) now tokenize. Full 67-construct sweep passes.
- CarveEmbed: inline "Edit" control in the node view to change a media embed's URL / video id in place.

### Changed
- Spec corpus submodule bumped from 7c41ccc to 750ddfa (126 categories, 24 new).
  New categories classified in the per-grammar coverage matrix; snapshot goldens
  refreshed for the changed and added corpus files.
- Prism: inline link/image titles now match backslash-escaped quotes
  (`[t](/url "ti\"tle")`), and links with empty text (`[](url)`) are highlighted.

## 0.1.0 - 2026-07-02

Initial release. Syntax + editor integration for the Carve markup language.

### Grammars
- Prism.js language definition (`carve-grammars/prism/carve.js`).
- highlight.js language definition (`carve-grammars/highlightjs/carve.js`).

### Tiptap integration (`carve-grammars/tiptap`)
- `CarveKit` - one Extension bundle: StarterKit plus Carve marks and nodes,
  keyboard map, and an in-block code-language picker.
- `serializeToCarve(json)` - convert a Tiptap/ProseMirror document to Carve
  markup; `escapeCarve` and `carveMediaDirective` helpers.
- Extensions: CarveInsert / CarveDelete (CriticMarkup), CarveDiv (admonitions),
  CarveSpan, CarveMath, CarveFootnote (+ definition), CarveEmbed, CarveAbbreviation,
  CarveDefinitionList, CarveMention / CarveTag, CarveKeymap.
- Parses the HTML that the reference parsers (carve-js / carve-php) actually
  render, so real documents round-trip: admonitions (`<aside class="admonition">`),
  math spans, footnote sections, media embeds (via a stamped `data-carve-source`),
  mentions/tags (`[@key]` citations), tight/loose lists, and task lists rendered
  as plain `<ul>` + checkboxes.
- Media embeds round-trip losslessly for every provider by reading the
  renderer-stamped `data-carve-source`, falling back to `:youtube[]` / `:vimeo[]`
  / `:media[]` reconstruction for un-stamped iframes.

### Tests
- Corpus round-trip, serializer, and a happy-dom HTML-parse harness verifying the
  editor path (HTML in -> Carve out).
