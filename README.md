# Carve Grammars

Grammars for the [Carve](https://github.com/markup-carve/carve) markup language:

- a **Tiptap** integration (editor kit, Carve loader and serializer) that converts between Carve markup and Tiptap/ProseMirror JSON;
- **Prism** and **highlight.js** syntax-highlighting grammars for rendering Carve source on the web;
- a **TextMate** grammar (`textmate/carve.tmLanguage.json`) for TextMate-based highlighters such as Shiki (used by VitePress).

Modeled on [djot-grammars](https://github.com/php-collective/djot-grammars), adapted to Carve's syntax. The Tiptap mark mapping mirrors `carve-php`'s `HtmlToCarve` converter; the highlighting grammars mirror the canonical token set in [`carve/resources/grammar.ebnf`](https://github.com/markup-carve/carve).

The TextMate grammar here is a **separate lineage** from the one in
[vscode-carve](https://github.com/markup-carve/vscode-carve), not a copy of it. The two
agree on the constructs they cover and differ in how they name scopes - this one carries
116 scope names against vscode-carve's 151, with `entity.name.tag.*` where that one uses
`entity.name.type.*`, and so on. Neither is derived from the other, and a scope name
present here is not a promise that the editor grammars use the same one.

> **Status:** Tiptap integration, plus Prism, highlight.js and TextMate grammars.
> Sibling editor grammars live in their own repos: editor-bundled **TextMate** copies in
> [vscode-carve](https://github.com/markup-carve/vscode-carve) and
> [intellij-carve](https://github.com/markup-carve/intellij-carve);
> **Tree-sitter** in [tree-sitter-carve](https://github.com/markup-carve/tree-sitter-carve)
> and [zed-carve](https://github.com/markup-carve/zed-carve).

## Install

```bash
npm install @markup-carve/carve-grammars
```

All peer dependencies are optional - install only what you use:
`@tiptap/core` + `@tiptap/starter-kit` (v2 or v3) for the editor, `prismjs` (v1)
for Prism, `highlight.js` (v11) for highlight.js. CI runs the suite against both
Tiptap majors.

On Tiptap 3, `CarveKit` disables StarterKit's bundled Underline and Link, since
it registers its own (underline carries Carve's `_text_` mapping). Pass
`starterKit: { underline: true }` to opt back in, at the cost of a duplicate
mark name.

`CarveKit` also pulls in several standalone Tiptap marks/extensions (highlight,
subscript, superscript, underline, link, image, table, task-list); install the
`@tiptap/extension-*` packages you use, or disable them via
`CarveKit.configure({ underline: false, ... })`.

## Usage

```js
import { Editor } from '@tiptap/core'
import { CarveKit, serializeToCarve } from '@markup-carve/carve-grammars/tiptap'

const editor = new Editor({
  element: document.getElementById('editor'),
  extensions: [CarveKit],
  onUpdate: ({ editor }) => {
    const carve = serializeToCarve(editor.getJSON())
    console.log(carve)
  },
})
```

### Individual extensions

```js
import StarterKit from '@tiptap/starter-kit'
import { CarveInsert, CarveDelete, CarveDiv, serializeToCarve } from '@markup-carve/carve-grammars/tiptap'

const editor = new Editor({
  extensions: [StarterKit, CarveInsert, CarveDelete, CarveDiv],
})
```

## Mark mapping

| Tiptap mark | Carve token | Renders as |
|-------------|-------------|------------|
| bold        | `*text*` / `{*text*}` | `<strong>` |
| italic      | `/text/` / `{/text/}` | `<em>`     |
| underline   | `_text_` / `{_text_}` | `<u>`      |
| code        | `` `text` `` | `<code>`  |
| highlight   | `=text=` / `{=text=}` | `<mark>`   |
| strike      | `~text~` / `{~text~}` | `<s>`      |
| subscript   | `{,text,}` (braced only) | `<sub>`    |
| superscript | `{^text^}` (braced only) | `<sup>`    |
| insert      | `{+text+}`  | `<ins>`    |
| delete      | `{-text-}`  | `<del>`    |
| link        | `[text](url)` / `[text](url "title")` | `<a>` |
| image       | `![alt](src)` / `![alt](src "title")` | `<img>` |
| span        | `[text]{.class}` | `<span class>` |
| abbreviation | `[text]{abbr="..."}` | `<abbr title>` \*\*\* |

\*\*\* `[text]{abbr="..."}` renders a real `<abbr title>` only when carve's
`SemanticSpanExtension` is enabled (the same opt-in extension also maps `{kbd}`
-> `<kbd>`, `{dfn}` -> `<dfn>`, `{samp}` -> `<samp>`, `{var}` -> `<var>`).
Without it, the attribute stays literal: `<span abbr="...">`. The mark's
`parseHTML` reads back the `<abbr title>` form.

The tokens target carve-php's **parser** (the contract: serialized Carve must parse
back to the same elements). Carve's inline syntax differs notably from Djot's:
emphasis is `/text/` (Djot uses `_`), `_text_` is underline, `~text~` is
strikethrough, highlight is `=text=`, and subscript/superscript are the
braced `{,text,}` / `{^text^}` only (a bare `,` or `^` is literal text since
carve #259).

Each single-char delimiter has two equivalent forms: a **bare** form
(`=text=`) and a **forced brace** form (`{=text=}`) that also works intraword;
both parse to the same element. The two columns above list bare / forced.
`serializeToCarve` emits the bare form for `* / _ ~` and the forced `{…}` form
for `= , ^` (round-trip-safe — those delimiters are likelier to be inert bare);
`{+…+}` / `{-…-}` (insert / delete) have only the brace form, since `+` / `-`
are not emphasis delimiters.

### Escaping

To honor that round-trip contract, `serializeToCarve` escapes literal Carve
syntax in plain text so it parses back as text rather than markup - inline code,
links, footnotes, CriticMarkup, mentions/tags/emoji, and an emphasis delimiter
appearing inside its own span. Escaping is **contextual**: Carve's flanking rules
already make most lone delimiters inert (`price * 2`, intraword `x_1`,
`comma,, two`, `C:\path`, `a@b.com`), so those stay clean. The same logic is
exposed as `escapeCarve(text)`.

## Block elements

Headings (`#`), bullet / ordered / task lists, blockquotes (`>`), fenced code
blocks (`` ``` lang ``), horizontal rules (`---`), tables (with `|=` header
cells and `^` / `<` row / column spans), container divs (`::: class`), and
definition lists.

## Loading Carve Into Tiptap

Use the AST loader when opening Carve source in an editor. It parses Carve with
`@markup-carve/carve` and builds the ProseMirror JSON shape consumed by
`CarveKit`, avoiding the lossy HTML pivot where attributes disappear unless a
Tiptap extension happens to claim them during `parseHTML`.

```js
import {
  CarveKit,
  carveToProseMirror,
  serializeToCarve,
} from '@markup-carve/carve-grammars/tiptap'

const content = carveToProseMirror(source, { unsupported: 'preserve' })

const editor = new Editor({
  extensions: [CarveKit],
  content,
})

const saved = serializeToCarve(editor.getJSON())
```

Entry points:

- `carveToProseMirror(source, options?)` parses Carve source and returns a
  ProseMirror `doc`.
- `astToProseMirror(ast, options?)` converts an already parsed Carve
  `document` AST.

Unsupported handling:

- `unsupported: 'throw'` is the default. The loader throws `UnsupportedNodeError`
  instead of silently dropping content.
- `unsupported: 'preserve'` first builds the richest available document and
  verifies that serializing it preserves the parsed AST. Unsupported subtrees
  use opaque `carveUnsupported` blocks; if a mapped document is still lossy,
  the loader falls back to one whole-document opaque block. `serializeToCarve`
  writes its source back byte-for-byte, including edge whitespace.

All corpus documents are therefore load/save lossless in preservation mode.
Some constructs remain opaque rather than directly editable, including parts
of figures, advanced tables, comments, raw passthrough, and source-layout edge
cases. `tiptap/schema-map.json` is the public rich-mapping authority;
`tests/lib/coverage.js` records why structured conversion falls back.

## Tab sets and code groups in the editor

A tab set and a code group are the same thing to a reader - a strip of labels,
one panel visible. In the editor they were not. A `:::: tabs` container had a
bar that could only switch panels; a `:::: code-group` had no bar at all, so it
rendered as a plain vertical stack of code blocks with its `[one.js]` labels
invisible and no way to tell it apart from two adjacent code blocks. Neither
could be edited as a widget: adding, removing, renaming or reordering a panel
meant leaving the visual editor and editing source.

Both now render an interactive bar:

| Action | How |
| --- | --- |
| switch panel | click a label |
| rename | double-click a label, then Enter (Escape abandons) |
| add | `+` |
| remove | `×` - refuses on the last panel |
| reorder | `‹` / `›` |

**Switching dispatches nothing.** It sets `data-active` on the wrapper and the
stylesheet does the rest, so moving between tabs never marks the document dirty
or reaches the serializer. The other four change the document and are undoable
like any other edit.

**The stylesheet is required, not decoration.** Because switching is only an
attribute, without these rules every panel is visible at once and clicking a
label appears to do nothing:

```js
import '@markup-carve/carve-grammars/tiptap/editor.css'
```

It reads carve-css custom properties when they are present and falls back to
literals otherwise, so it composes with that package without depending on it.

Two things worth knowing:

- **A code group is still a plain `carveDiv`.** It arrives as a div with
  `class: "code-group"` whose children carry their own `carveLabel`, and giving
  it dedicated node types to mirror the tab-set shape would change what the
  serializer sees for a change that is entirely about presentation. So the bar
  attaches to the existing node: the document shape, the serializer and the
  round trip are untouched. The cost is that the nodeView is called for every
  div, so every other kind - admonitions, figures, plain containers - is handed
  straight back to the schema's own `toDOM`.
- **A code group mounted from HTML shows languages, not labels.** carve-js's
  HTML for a code group emits bare `<pre>` children and drops the per-block
  `[label]`, so `one.js` is not recoverable from that seed and the bar falls
  back to `js`. Mounted from the AST (`carveToProseMirror`) the labels survive
  and are shown. Renaming writes `carveLabel` and never touches the language, so
  changing a tab's caption cannot silently restyle the code.

Disable the code-group bar with `CarveKit.configure({ carveCodeGroup: false })`,
or keep it read-only with
`CarveKit.configure({ carveCodeGroup: { editable: false } })`.

## Framework-independent editor element

Applications that do not otherwise use Tiptap can mount the same lossless
bridge through a Web Component:

```js
import { defineCarveEditor } from '@markup-carve/carve-grammars/editor'

defineCarveEditor()
const editor = document.querySelector('carve-editor')
editor.value = '# Hello'
editor.addEventListener('input', event => save(event.detail.value))
```

```html
<carve-editor></carve-editor>
```

The element exposes a string `value`, emits bubbling and composed `input`
events, and uses `unsupported: 'preserve'` internally. Its editable surface is
available as the `editor` CSS part (`carve-editor::part(editor)`). Tiptap stays
an implementation detail of the element, although its peer packages must be
installed with `carve-grammars`.

## Syntax highlighting

Render Carve source as highlighted HTML on the web. Both grammars cover the full
Carve token set: headings, lists, tables, blockquotes, fenced/raw blocks,
container divs, front matter and comments, plus inline emphasis
(`*bold*` `/italic/` `_underline_` `~strike~` `=highlight=`, braced
`{^sup^}` `{,sub,}`),
code, links, images, spans, attributes, footnotes, math (`` $`x` ``),
CriticMarkup (`{+ins+}` `{-del-}`), mentions, tags and emoji.

### Where the three grammars deliberately differ

The TextMate grammar is stricter than the Prism and highlight.js grammars about
**indented block openers at document level**, and that difference is a decision
rather than drift.

Carve opens a block at column 0, or at an enclosing container's content column -
nowhere in between. So at document level these are all ordinary paragraphs:

````
 # H
 > q
 *[HTML]: HyperText
 ```js
 x
 ```
````

while the same four openers at a list item's content column are real blocks:

````
- item

  # H

  > quoted

  ```js
  x
  ```
````

Telling those two apart needs block context. Only the TextMate grammar has it:
its list-item rules track the item's actual content column, so a document-level
rule can be anchored at column 0 while an `_in_container` twin stays permissive
and is reachable only from inside a container. Its `heading`, `fenced_code`,
`blockquote` and `abbreviation` rules are therefore anchored at column 0, and
`heading_in_container`, `fenced_code_in_container`, `blockquote_in_container`
and `abbreviation_in_container` carry the indented forms.

Prism and highlight.js are line-based and have no container model, so they
cannot make that distinction. Anchoring their block rules at column 0 would not
buy accuracy - it would stop highlighting **every** legitimately indented
construct inside a list item or a block quote, which is a common valid shape,
in exchange for correcting a rare invalid one. So both keep their `^[ \t]*`
anchors and knowingly over-colour the indented-at-document-level case.

The practical consequence: a document that indents a heading, fence, blockquote
or abbreviation definition by one or two columns at top level is highlighted by
Prism and highlight.js and left as plain text by the TextMate grammar (Shiki,
VS Code). The TextMate answer is the one that agrees with the engines.

`tests/lib/constructs.js` is the shared construct inventory all three sweeps
read, and the same asymmetry is written down there as `skip` entries on the
column-sensitive cases; the TextMate-only column cases live in the `NEGATIVE`
list in `tests/textmate-sweep-test.js`.

### One rule, three spellings: a leading byte order mark

A byte order mark at the **start of a document** is not content. The spec says
so ("Line endings and a byte order mark"), and carve-js, carve-rs and carve-php
all strip it before the block scanner runs. It is neither a space nor a tab, so
without an explicit allowance it sits between the line start and the marker and
defeats every line-anchored opener - a mark in front of a heading left the title
unscoped, and a mark in front of a fence handed the line to the inline code rule
instead.

All three grammars now allow it, and the restriction to the document's start is
load-bearing rather than pedantry. A mark anywhere else is an ordinary
zero-width character that opens nothing:

```
# T

<a byte order mark here>- item
```

renders as a paragraph holding literal text in carve-rs and in carve-php, and as
a list only in carve-js, whose own `\s` class is Unicode White_Space plus U+FEFF
(markup-carve/carve#806). Every rule here anchors with `^` under a multiline
flag, which matches at *every* line start, so the allowance has to carry its own
document-start assertion - and the three grammars do not share one:

| grammar | spelling | mechanism |
| --- | --- | --- |
| prism | `(?:(?<![\s\S])\uFEFF)?` | JavaScript lookbehind: nothing precedes offset 0 |
| highlightjs | `(?:(?<![\s\S])\uFEFF)?` | the same, and it survives highlight.js compilation |
| textmate | `(?:\A\x{FEFF})?` | Oniguruma `\A`, which vscode-textmate resolves against the first line only |

The codepoint is always written as an escape. No file in this repo holds a
literal byte order mark: it is invisible, and an editor or a normalizing filter
can drop the one character a rule is about. The spec corpus is the exception and
can afford to be - it marks `tests/corpus/**` as `-text`, so
`250-line-endings-and-a-byte-order-mark-3.crv` really does begin `ef bb bf`.

### Fence words

All three surfaces answer `carve` and `crv`. `.crv` is the canonical file
extension, so a ` ```crv ` fence highlights wherever a ` ```carve ` one does,
whichever highlighter a site runs.

| Surface | Answers | Extra |
|---|---|---|
| Prism | `carve`, `crv` | `carvemd`, the embedded form |
| highlight.js | `carve`, `crv` | any casing: `getLanguage` lowercases its argument |
| Shiki | `carve`, `crv` | `Carve`, because Shiki matches a name by exact string |

The extras differ because the lookups do. Shiki is the only surface where a
capitalized spelling is a distinct alias worth listing; Prism keys must be
lowercase, since `Prism.util.getLanguage` lowercases the `language-xxx` class
before resolving it. `tests/lib/aliases.js` holds the required set and
`tests/alias-parity-test.js` asserts it on each surface through that surface's
own registration API.

### Prism

The grammar registers itself against the global `Prism`, so `Prism` must be
global before the grammar module runs. Because static `import` statements are
hoisted (they all evaluate before any top-level assignment), load the grammar
with a dynamic `import` after assigning `globalThis.Prism`:

```js
import Prism from 'prismjs'

globalThis.Prism = Prism                       // grammar reads the global Prism
await import('@markup-carve/carve-grammars/prism/carve.js')  // registers Prism.languages.carve

const html = Prism.highlight(source, Prism.languages.carve, 'carve')
```

In the browser, load `prismjs` first (it sets the global `Prism`), then load
`@markup-carve/carve-grammars/prism/carve.js`.

### highlight.js

```js
import hljs from 'highlight.js'
import carve from '@markup-carve/carve-grammars/highlightjs/carve.js'

hljs.registerLanguage('carve', carve)
const { value } = hljs.highlight(source, { language: 'carve' })
```

Loaded as a classic `<script>` after highlight.js, it self-registers against
the global `hljs`:

```html
<script src="highlight.min.js"></script>
<script src="node_modules/@markup-carve/carve-grammars/highlightjs/carve.js"></script>
<script>hljs.highlightAll();</script>
```

### Shiki / VitePress

`@markup-carve/carve-grammars/shiki` is the shared kit every Carve docs site uses, so
highlighting stays identical across them: the TextMate grammar, GitHub
light/dark themes extended with Carve scope colors, and a transformer + CSS
pair that bridges what Shiki's HTML emitter cannot express (strikethrough,
sub/superscript positioning, highlight background).

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress'
import { carveMarkdown } from '@markup-carve/carve-grammars/shiki'

export default defineConfig({
  markdown: {
    ...carveMarkdown(),
    // carveMarkdown({ light, dark, languages }) to override base themes
    // or register extra grammars
  },
})
```

```ts
// .vitepress/theme/index.ts
import '@markup-carve/carve-grammars/shiki/carve.css'
```

Named exports for other setups: `carveGrammar`, `carveLightExtras` /
`carveDarkExtras`, `carveLightTheme` / `carveDarkTheme`, `extendTheme`,
`carveStylingTransformer`.

## Diagram rendering

Carve's `FencedRenderExtension` presets emit a `<pre class="LANG">source</pre>`
hydration element; something on the client turns it into a diagram. Mermaid,
WaveDrom, Vega-Lite and Chart each render once **you** load their browser
library. For the rest, `@markup-carve/carve-grammars/diagrams` ships renderers:

| Type | Renderer | Engine | Network |
|------|----------|--------|---------|
| `graphviz` (`dot`) | `renderGraphvizDiagrams` | `@viz-js/viz` (WASM) | **offline** |
| `d2` | `renderD2Diagrams` | `@terrastruct/d2` (WASM) | **offline** |
| `plantuml` (`puml`) | `renderKrokiDiagrams` | a Kroki server | **network** |

Graphviz and D2 render **entirely in the browser** - no server, no external
call, works offline (in an IDE, behind a firewall, ...). The rendered SVG is
placed in an inert `<img>` data URI (like the Kroki path), so even untrusted
diagram source cannot run script or expose a `javascript:` link. The WASM
libraries are optional peer dependencies, imported lazily only when a matching
block is on the page:

```js
import { renderGraphvizDiagrams } from '@markup-carve/carve-grammars/diagrams/graphviz'
import { renderD2Diagrams } from '@markup-carve/carve-grammars/diagrams/d2'

await renderGraphvizDiagrams(container)
await renderD2Diagrams(container)
```

`renderDiagrams` runs both (and PlantUML, when you opt in) in one call; each
no-ops when its blocks are absent, so you pay nothing for the types not present:

```js
import { renderDiagrams } from '@markup-carve/carve-grammars/diagrams'

await renderDiagrams(container)                       // graphviz + d2, offline
await renderDiagrams(container, { kroki: {} })        // + PlantUML via kroki.io
await renderDiagrams(container, { kroki: { server: 'https://kroki.internal' } })
```

### PlantUML (Kroki)

PlantUML is the one preset with no practical in-browser renderer - its only
pure-JS build is a multi-megabyte JVM-in-WASM. `renderKrokiDiagrams` renders it
by POSTing the source to a [Kroki](https://kroki.io) server; the returned SVG
rides in an `<img>` data URI (which cannot execute script). Idempotent, and
dependency-free (plain-text POST, no deflate/base64).

> ⚠️ **Privacy / GDPR.** The default server is the **public `https://kroki.io`**,
> so the diagram source is sent to a **third party outside your domain**. For
> anything sensitive, or to stay offline, point `server` at a **self-hosted or
> localhost Kroki** so no data leaves your control - and disclose the external
> call to end users where required. Because of this, `renderDiagrams` leaves the
> Kroki step **off unless you pass `kroki`**.

```js
import { renderKrokiDiagrams } from '@markup-carve/carve-grammars/diagrams/kroki'

await renderKrokiDiagrams(container, { server: 'https://kroki.internal' })
```

Options: `server` (default `https://kroki.io`), `types` (class → Kroki-type map,
default `KROKI_DIAGRAM_TYPES` = `plantuml`/`puml` only; extend it to Kroki-render
graphviz/d2 against a self-hosted server), `onError`, `fetch`.

> When the diagram is rendered at build time (SSG) rather than in the browser,
> prefer the engine's static-render hook (carve-js `renderers.plantuml`,
> carve-php's own render pipeline) so the page ships finished SVG and needs no
> client JS at all.

## API

- `renderDiagrams(container, options?)` - render Graphviz + D2 (offline), and
  PlantUML via Kroki when `options.kroki` is set. See
  [Diagram rendering](#diagram-rendering).
- `renderGraphvizDiagrams(container, options?)` / `renderD2Diagrams(container, options?)` -
  render `graphviz`/`d2` blocks with the offline WASM engines.
- `renderKrokiDiagrams(container, options?)` - render PlantUML (and any opted-in
  type) via a Kroki server; `KROKI_DIAGRAM_TYPES` is the default class→type map.
- `carveToProseMirror(source, options?)` - parse Carve source and convert it to
  ProseMirror JSON. `options.unsupported` is `'throw'` by default or
  `'preserve'` for opaque source-preserving blocks.
- `astToProseMirror(ast, options?)` - convert an existing `@markup-carve/carve`
  AST to ProseMirror JSON.
- `serializeToCarve(doc)` - serialize an `editor.getJSON()` document to Carve markup.
- `escapeCarve(text)` - contextually escape literal Carve syntax in a plain-text run so it round-trips as text (used internally by `serializeToCarve`).
- `CarveKit` - the bundled Tiptap extension set.
- Individual extensions: `CarveInsert`, `CarveDelete`, `CarveCriticComment`, `CarveDiv`, `CarveSpan`, `CarveFootnote`, `CarveFootnoteDefinition`, `CarveMath`, `CarveEmbed`, `CarveAbbreviation`, `CarveDefinitionList`, `CarveUnsupported`.

## Schema map (for other engines)

`tiptap/schema-map.json` publishes the Carve-to-ProseMirror vocabulary as data, so
an engine building a bridge in another language reads it instead of restating it:

```js
import map from '@markup-carve/carve-grammars/tiptap/schema-map.json'

map.types.strong        // { kind: 'mark', pm: 'bold' }
map.types.list          // { kind: 'node', pm: ['bulletList', 'orderedList', 'taskList'], ... }
map.unmapped.figure     // 'figure / caption blocks are not modeled'
```

Every Carve node type appears exactly once, either in `types` with its
ProseMirror name(s) or in `unmapped` with the reason it has none - the negative
space is part of the contract, because a bridge that silently drops table
alignment or figure captions is worse than one that says it cannot carry them.

`tests/schema-map-test.js` keeps it honest: every ProseMirror name must exist in
the `CarveKit` schema with the declared node/mark kind, and every type in the
pinned spec vocabulary must have a decision. Types the map covers ahead of the
`spec/` pin are declared explicitly and must be removed once the pin catches up.

Two sections are keyed by ProseMirror name rather than by Carve type, because
neither names a Carve construct: `preservationNodes` (`carveUnsupported` and
`carveUnsupportedInline`, the atoms holding a construct's exact source) and
`markCarrierNodes` (`carveEmptyMark`, the atom a mark with no content rides on).
Both are part of the wire - an unknown ProseMirror name is an error rather than a
skip - so a bridge has to read them alongside `types`.

Restating this mapping per engine is what the spec's own node-vocabulary test was
written to prevent: carve-php once emitted `citation-group` while every other
implementation spelled it with underscores.

## Attributes, math and footnotes

- **Attributes** - spans, headings and images serialize an `id` and `class`
  (and any extra non-structural attrs) as a `{#id .class key="val"}` block, e.g.
  `[text]{#me .note}`, `![alt](src){.wide}`. Inline attrs trail their target;
  block attrs (headings) sit on the **preceding** line (strict djot), e.g.
  `{#slug}` then `# Title`.
- **Attribute order** - a run is written back in the order it was AUTHORED, not
  in a canonical one. ProseMirror attributes are an unordered map, so the order
  travels as its own attribute, `carveAttrOrder`: the AST's `order` field
  verbatim, an array whose entries are `#id`, `.class` and each key by name.

  ```js
  carveToProseMirror('[x]{key=c .a #b}')
  // the carveSpan mark carries: { id: 'b', class: 'a',
  //   carveKeyValues: { key: 'c' }, carveAttrOrder: ['key', '.class', '#id'] }
  ```

  All of a node's classes stay contiguous at the position of the first one,
  which is what the AST records. A document with no `carveAttrOrder` - anything
  an editor builds from scratch - writes the canonical `#id .class key="val"`
  order, and a slot the order names but the document no longer has is skipped.
- **Math** - `CarveMath` (inline atom) serializes to `` $`x` `` and, with
  `display: true`, `` $$`x` ``. Math has no closing `$` sentinel (grammar.ebnf
  PART 9 §18): the `$` / `$$` prefix opens a verbatim span and the backtick run
  ends it, which is what keeps currency like `$5` literal.
- **Footnotes** - `CarveFootnote` is the inline `[^label]` reference;
  `CarveFootnoteDefinition` is the matching body block, serialized as
  `[^label]: body`.

## Tests

```bash
npm test
```

The suite holds all three grammars to one source of truth: the shared corpus
from the [`markup-carve/carve`](https://github.com/markup-carve/carve) spec,
vendored as the `spec/` git submodule (`git submodule update --init`).

- `npm run test:coverage` - the coverage matrix. Each grammar (prism,
  highlightjs, tiptap) declares a covered-category set and a skip set (with a
  reason per skip); the test fails if the two do not partition every corpus
  category, so a new spec category forces a deliberate decision.
- `npm run test:snapshot` - golden token snapshots. Each covered `.crv` is
  tokenized with Prism's and highlight.js's own tokenizers and the token stream
  (type + text) is compared against a committed golden in `tests/snapshots/`.
  Refresh intended changes with `npm run snapshots:update`.
- `npm run test:roundtrip` - the Tiptap serializer round-trip. Each covered
  `.crv` runs `parse -> ProseMirror JSON -> serializeToCarve -> parse` and the
  two parsed ASTs must be identical, catching serializer drift. Categories the
  serializer cannot represent are skipped with a reason.

`npm test` runs all of the above plus the structural grammar and serializer
unit tests. CI runs the same on Node 18, 20 and 22.
