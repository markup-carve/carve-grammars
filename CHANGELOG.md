# Changelog

All notable changes to `carve-grammars` are documented here.

## 0.1.1 - Unreleased

### Added
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
