# Carve Grammars

Editor integration and syntax-highlighting grammars for the
[Carve](https://github.com/markup-carve/carve) markup language.

The package contains:

- a Tiptap kit, Carve loader, and serializer for Carve and ProseMirror JSON;
- Prism and highlight.js grammars for browser highlighting;
- a TextMate grammar for Shiki, VitePress, and other TextMate consumers.

Tree-sitter and editor-bundled grammars live in
[tree-sitter-carve](https://github.com/markup-carve/tree-sitter-carve),
[vscode-carve](https://github.com/markup-carve/vscode-carve), and the other
editor repositories. This package's TextMate grammar has a separate lineage
from the VS Code grammar. The [complete reference](docs/reference.md) explains
their scope and naming differences.

## Install

```bash
npm install @markup-carve/carve-grammars
```

Peer dependencies are optional. Install only those needed by the selected
entry point. For Tiptap, install `@tiptap/core`, `@tiptap/pm`,
`@tiptap/starter-kit`, and the extensions used by `CarveKit`. The package is
tested with Tiptap 2 and 3. The complete peer-dependency command is in the
[installation reference](docs/reference.md#install).

## Tiptap

```js
import { Editor } from '@tiptap/core'
import {
  CarveKit,
  carveToProseMirror,
  serializeToCarve,
} from '@markup-carve/carve-grammars/tiptap'

const editor = new Editor({
  element: document.getElementById('editor'),
  extensions: [CarveKit],
  content: carveToProseMirror(source, { unsupported: 'preserve' }),
  onUpdate: ({ editor }) => {
    const carve = serializeToCarve(editor.getJSON())
    console.log(carve)
  },
})
```

`unsupported: 'throw'` is the default. Preservation mode retains authored
source details that ProseMirror cannot model directly and merges edits back
into the original Carve source.

Individual extensions are also exported for hosts that do not want
`CarveKit`:

```js
import StarterKit from '@tiptap/starter-kit'
import {
  CarveDelete,
  CarveDiv,
  CarveInsert,
  serializeToCarve,
} from '@markup-carve/carve-grammars/tiptap'

const editor = new Editor({
  extensions: [StarterKit, CarveInsert, CarveDelete, CarveDiv],
})
```

## Task states

Task markers are `[ ]` open, `[_]` open alias, `[/]` progress, `[!]` blocked,
`[x]` or `[X]` done, `[-]` dropped, `[>]` deferred and `[?]` uncertain. Only
`x` and `X` are checked. The Tiptap task item keeps a nondefault marker in
`carveTaskState` and writes it as `data-task-state` on the list item.

## Syntax highlighting

```js
import Prism from 'prismjs'

globalThis.Prism = Prism
await import('@markup-carve/carve-grammars/prism/carve.js')
```

```js
import hljs from 'highlight.js/lib/core'
import carve from '@markup-carve/carve-grammars/highlightjs/carve.js'
import { csv, tsv } from '@markup-carve/carve-grammars/highlightjs/delimited.js'

hljs.registerLanguage('carve', carve)
hljs.registerLanguage('csv', csv)
hljs.registerLanguage('tsv', tsv)
```

For Prism or highlight.js, load the optional table token colors after the
highlighter's theme stylesheet:

```js
import '@markup-carve/carve-grammars/shiki/table-tokens.css'
```

Table pipes are gray, header markers blue, alignment markers orange, span
markers purple, and continuation markers green. Shiki's included light and dark
themes carry the same palette without this stylesheet. Prism uses
`table-alignment`, `table-span`, and `table-continuation-marker` for the new
roles; highlight.js uses `table-alignment`, `table-span`, and
`table-continuation`.
For a dark Prism or highlight.js theme, set `.dark` or
`data-theme="dark"` on an ancestor.

TextMate consumers can load `textmate/carve.tmLanguage.json`. Shiki and
VitePress users can call `carveMarkdown()` from
`@markup-carve/carve-grammars/shiki`; it registers both `carve` and `crv`.
CSV and TSV fence bodies are highlighted in all three grammars. `carveMarkdown()`
includes `carveCsvGrammar` and `carveTsvGrammar`, which are also exported for
direct Shiki registration. Register `highlightjs/delimited.js` as shown above
when using highlight.js; Prism needs no additional registration.
A fenced code block highlights its body with the grammar its language word
names in [`fence-languages.json`](fence-languages/README.md), a `=html` raw block
as HTML, and a bare fence under a `{.diff}` line as a diff. The host has to have
those grammars loaded; a fence whose grammar is missing keeps its plain body.

The implementations deliberately differ where their host engines have
different capabilities. The [syntax-highlighting reference](docs/reference.md#syntax-highlighting)
covers substitutions, attributes, fence words, byte order marks, and engine
limits.

## Diagrams

The `/diagrams` entry point renders Graphviz and D2 offline. PlantUML rendering
is available through an opt-in Kroki renderer, which sends diagram source to
the configured Kroki service. Mermaid, WaveDrom, Vega-Lite, and Chart blocks
use libraries loaded by the host page. Configuration and security details are
in the [diagram reference](docs/reference.md#diagram-rendering).

## Reference

The [complete reference](docs/reference.md) covers the Carve-to-Tiptap mapping,
loading and preservation behavior, tab sets, code groups, and the
framework-independent `<carve-editor>` element. It also documents highlighting
compatibility, diagram configuration, API exports, and the schema map.

## Development

Contributor setup, tests, and maintenance commands are in the
[development guide](docs/development.md). The [September 30 audit](https://github.com/markup-carve/carve-grammars/blob/main/docs/spec-engine-audit-20260930.md)
records current editor behavior and remaining highlighting gaps.
