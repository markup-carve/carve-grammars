# Carve Grammars

Syntax highlighting for Carve 0.2 in Prism, highlight.js, TextMate, and Shiki. The language name is `carve`; `crv` is its file extension alias. These grammars replace the 0.1 grammars. The package no longer includes the 0.1 Tiptap editor kit or serializer.

## Install

```sh
npm install @markup-carve/carve-grammars prismjs
```

## Prism

```js
import Prism from 'prismjs'
import '@markup-carve/carve-grammars/prism/carve.js'

Prism.highlight(source, Prism.languages.carve, 'carve')
```

For highlight.js, import `@markup-carve/carve-grammars/highlightjs/carve.js` and register it as `carve`. For TextMate, load `textmate/carve.tmLanguage.json`. For Shiki, import `carveMarkdown` or `carveGrammar` from the package root or `@markup-carve/carve-grammars/shiki`.

The package also ships host helpers that work with any of these: `diff` and `shiki/diff` for `{.diff}` fences, `diagrams` for Graphviz, D2 and PlantUML blocks, and `fence-languages.json`, the fence-word table editor grammars embed by. See the [reference](docs/reference.md).

See the [migration guide](docs/migration-0.2.md) for every renamed path and removed surface.
