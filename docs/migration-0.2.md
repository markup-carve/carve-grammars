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

The 0.1 Tiptap editor kit (`tiptap/*`, `tiptap/editor.css`, `tiptap/schema-map.json`, `editor`), its serializer and the old grammar tests are gone. Those surfaces map the 0.1 document tree. `tiptap` is now the 0.2 kit: `CarveKit`, `carveToProseMirror` and `serializeToCarve` keep their names, and the loader and serializer take the carve-js engine as `{ engine }` (see [the Tiptap kit guide](tiptap.md)). The other 0.1 names have no 0.2 counterpart:

| Removed 0.1 surface | 0.2 replacement |
|---|---|
| `./editor` web component: `CarveEditorElement`, `defineCarveEditor` (`tiptap/carve-editor.js`) | No replacement in 0.2. |
| `CarveKeymap` (`tiptap/extensions/carve-keymap.js`) | No replacement in 0.2. |
| `escapeCarve` (`tiptap/serializer.js`) | No replacement in 0.2. The 0.2 serializer delegates writing to the carve-js engine. |
| `CarveAbbreviation` (`tiptap/extensions/carve-abbreviation.js`) | No replacement in 0.2. |
| `CarveAbbreviationDefinition` (`tiptap/extensions/carve-abbreviation-definition.js`) | No replacement in 0.2. |
| `CarveMention` (`tiptap/extensions/carve-mention.js`) | No replacement in 0.2. |
| `CarveTag` (`tiptap/extensions/carve-mention.js`) | No replacement in 0.2. |
| `CarveCriticComment` (`tiptap/extensions/carve-critic-comment.js`) | No replacement in 0.2. |

These surfaces do not depend on the grammar version and stay at their paths: `diagrams` (and `diagrams/kroki`, `diagrams/graphviz`, `diagrams/d2`, `diagrams/*`), `diff`, `diff/carve-diff.css`, `shiki/diff` (also re-exported from `shiki`), `fence-languages.json`, `textmate/tsv.tmLanguage.json`, and the `prism/*` and `highlightjs/*` wildcards. The `carve` row of `fence-languages.json` now names `source.carve`.
