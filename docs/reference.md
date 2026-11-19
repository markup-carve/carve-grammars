# Highlighter entry points

| Surface | Package path | Language name |
|---|---|---|
| Prism | `@markup-carve/carve-grammars/prism/carve.js` | `carve`, `crv` |
| highlight.js | `@markup-carve/carve-grammars/highlightjs/carve.js` | `carve`, `crv` |
| TextMate | `@markup-carve/carve-grammars/textmate/carve.tmLanguage.json` | `source.carve` |
| Shiki | `@markup-carve/carve-grammars/shiki` | `carve`, `crv`, `Carve` |

The package root exports the Shiki setup. `themes/carve-code.css` styles Prism and highlight.js output for both `carve` and `crv`.
