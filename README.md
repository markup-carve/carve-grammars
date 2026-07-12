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
npm install carve-grammars
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
import { CarveKit, serializeToCarve } from 'carve-grammars/tiptap'

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
import { CarveInsert, CarveDelete, CarveDiv, serializeToCarve } from 'carve-grammars/tiptap'

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
| subscript   | `,text,` / `{,text,}` | `<sub>`    |
| superscript | `^text^` / `{^text^}` | `<sup>`    |
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
strikethrough, subscript is `,text,`, and highlight is `=text=` (single-char
delimiters since carve #108).

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
(`*bold*` `/italic/` `_underline_` `~strike~` `=highlight=` `^sup^` `,sub,`),
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
await import('carve-grammars/prism/carve.js')  // registers Prism.languages.carve

const html = Prism.highlight(source, Prism.languages.carve, 'carve')
```

In the browser, load `prismjs` first (it sets the global `Prism`), then load
`carve-grammars/prism/carve.js`.

### highlight.js

```js
import hljs from 'highlight.js'
import carve from 'carve-grammars/highlightjs/carve.js'

hljs.registerLanguage('carve', carve)
const { value } = hljs.highlight(source, { language: 'carve' })
```

Loaded as a classic `<script>` after highlight.js, it self-registers against
the global `hljs`:

```html
<script src="highlight.min.js"></script>
<script src="node_modules/carve-grammars/highlightjs/carve.js"></script>
<script>hljs.highlightAll();</script>
```

## API

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
