# Migrate highlighters to Carve 0.2

Carve 0.2 replaces the 0.1 grammars. Use the final `carve` language name for code fences and registration. `crv` remains the extension alias.

| Old 0.2 path | Final path |
|---|---|
| `prism/carve2.js` | `prism/carve.js` |
| `highlightjs/carve2.mjs` | `highlightjs/carve.mjs` or `highlightjs/carve.js` |
| `textmate/carve2.tmLanguage.json` | `textmate/carve.tmLanguage.json` |
| `scripts/build-carve2-textmate.mjs` | Removed; TextMate JSON is the source |
| `tests/carve2-grammar-test.js` | `tests/carve-grammar-test.js` |
| `tests/carve2-spec-cases.json` | `tests/carve-spec-cases.json` |
| `tests/snapshots/carve2.json` | `tests/snapshots/carve.json` |

Prism registers `Prism.languages.carve` and `Prism.languages.crv`. highlight.js registers `carve` with `crv` as an alias. TextMate now uses `source.carve`. Shiki's `carveGrammar` and `carveMarkdown()` load that grammar under `carve` and `crv`.

The 0.1 Tiptap editor kit (`tiptap`, `tiptap/*`, `tiptap/editor.css`, `tiptap/schema-map.json`, `editor`), its serializer and the old grammar tests are gone. Those surfaces map the 0.1 document tree; consumers keep a 0.1.x release until a Carve 0.2 editor exists.

These surfaces do not depend on the grammar version and stay at their paths: `diagrams` (and `diagrams/kroki`, `diagrams/graphviz`, `diagrams/d2`, `diagrams/*`), `diff`, `diff/carve-diff.css`, `shiki/diff` (also re-exported from `shiki`), `fence-languages.json`, `textmate/tsv.tmLanguage.json`, and the `prism/*` and `highlightjs/*` wildcards. The `carve` row of `fence-languages.json` now names `source.carve`.
