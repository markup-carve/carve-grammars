# Carve Grammars

Grammars for the [Carve](https://github.com/markup-carve/carve) markup language:

- a **Tiptap** integration (editor kit + serializer) that turns a Tiptap/ProseMirror document into Carve markup;
- **Prism** and **highlight.js** syntax-highlighting grammars for rendering Carve source on the web;
- a **TextMate** grammar (`textmate/carve.tmLanguage.json`) for TextMate-based highlighters such as Shiki (used by VitePress).

Modeled on [djot-grammars](https://github.com/php-collective/djot-grammars), adapted to Carve's syntax. The Tiptap mark mapping mirrors `carve-php`'s `HtmlToCarve` converter; the highlighting grammars mirror the canonical token set in [`carve/resources/grammar.ebnf`](https://github.com/markup-carve/carve) and the TextMate grammar in [vscode-carve](https://github.com/markup-carve/vscode-carve).

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
`@tiptap/core` + `@tiptap/starter-kit` (v2) for the editor, `prismjs` (v1) for
Prism, `highlight.js` (v11) for highlight.js.

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

## Syntax highlighting

Render Carve source as highlighted HTML on the web. Both grammars cover the full
Carve token set: headings, lists, tables, blockquotes, fenced/raw blocks,
container divs, front matter and comments, plus inline emphasis
(`*bold*` `/italic/` `_underline_` `~strike~` `=highlight=`, braced
`{^sup^}` `{,sub,}`),
code, links, images, spans, attributes, footnotes, math (`` $`x`$ ``),
CriticMarkup (`{+ins+}` `{-del-}`), mentions, tags and emoji.

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

## Diagram rendering (Kroki)

Carve's `FencedRenderExtension` presets that have a browser library - Mermaid,
WaveDrom, Vega-Lite, Chart - render themselves once you load that library. The
presets that have **no** browser library - **PlantUML**, **D2**, **Graphviz** -
emit a `<pre class="LANG">source</pre>` hydration element instead. This helper
turns those into diagrams client-side via a [Kroki](https://kroki.io) server:

```js
import { renderKrokiDiagrams } from '@markup-carve/carve-grammars/diagrams/kroki'

// after inserting the rendered Carve HTML into the page
await renderKrokiDiagrams(document.querySelector('.carve-output'))
```

Each matching `<pre>` is replaced with an `<img>` of the Kroki SVG. It is
dependency-free (the source is POSTed to Kroki as plain text - no
deflate/base64 step) and safe (the SVG rides in an `<img>` data URI, so it
cannot execute script). Processing is idempotent, so it is fine to call after
every content update.

Output is SVG (a `data:image/svg+xml` `<img>`). Options: `server` (default
`https://kroki.io`; point it at a self-hosted instance), `types` (the
CSS-class → Kroki-type map, default `KROKI_DIAGRAM_TYPES` covering
`plantuml`/`puml`, `d2`, `graphviz`/`dot` - pass a subset to restrict, or
extend it for other Kroki diagram types), `onError`, and `fetch` (overridable
for tests / non-browser hosts).

```js
await renderKrokiDiagrams(container, {
  server: 'https://kroki.internal',
  types: { plantuml: 'plantuml', puml: 'plantuml' }, // only PlantUML
})
```

> When the diagram is rendered at build time (SSG) rather than in the browser,
> prefer the engine's static-render hook (carve-js `renderers.plantuml`,
> carve-php's own render pipeline) so the page ships finished SVG and needs no
> client JS at all.

## API

- `renderKrokiDiagrams(container, options?)` - render PlantUML/D2/Graphviz
  fenced-render blocks under `container` via a Kroki server; returns the count
  rendered. `KROKI_DIAGRAM_TYPES` is the default class→type map. See
  [Diagram rendering](#diagram-rendering-kroki).
- `serializeToCarve(doc)` - serialize an `editor.getJSON()` document to Carve markup.
- `escapeCarve(text)` - contextually escape literal Carve syntax in a plain-text run so it round-trips as text (used internally by `serializeToCarve`).
- `CarveKit` - the bundled Tiptap extension set.
- Individual extensions: `CarveInsert`, `CarveDelete`, `CarveDiv`, `CarveSpan`, `CarveFootnote`, `CarveFootnoteDefinition`, `CarveMath`, `CarveEmbed`, `CarveAbbreviation`, `CarveDefinitionList`.

## Attributes, math and footnotes

- **Attributes** - spans, headings and images serialize an `id` and `class`
  (and any extra non-structural attrs) as a `{#id .class key="val"}` block, e.g.
  `[text]{#me .note}`, `![alt](src){.wide}`. Inline attrs trail their target;
  block attrs (headings) sit on the **preceding** line (strict djot), e.g.
  `{#slug}` then `# Title`.
- **Math** - `CarveMath` (inline atom) serializes to `` $`x`$ `` and, with
  `display: true`, `` $$`x`$$ ``.
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
