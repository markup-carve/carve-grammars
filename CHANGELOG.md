# Changelog

All notable changes to `carve-grammars` are documented here.

## 0.1.1 - Unreleased

### Added
- CarveEmbed: inline "Edit" control in the node view to change a media embed's URL / video id in place.

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
