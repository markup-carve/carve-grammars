# Highlighter entry points

| Surface | Package path | Language name |
|---|---|---|
| Prism | `@markup-carve/carve-grammars/prism/carve.js` | `carve`, `crv` |
| highlight.js | `@markup-carve/carve-grammars/highlightjs/carve.js` | `carve`, `crv` |
| TextMate | `@markup-carve/carve-grammars/textmate/carve.tmLanguage.json` | `source.carve` |
| Shiki | `@markup-carve/carve-grammars/shiki` | `carve`, `crv`, `Carve` |

The package root exports the Shiki setup. `themes/carve-code.css` styles Prism and highlight.js output for both `carve` and `crv`.

## Diff presentation with an underlying language

Carve keeps a code block's presentation hooks separate from its language. The
portable source convention for an instructional diff is a `.diff` block
attribute above a language-tagged fence:

````carve
{.diff}
```js
- fileIcon.classList.add("icon-file-text");
+ fileIcon.classList.remove("icon-file-text");
```
````

Core HTML preserves both channels as
`<pre class="diff"><code class="language-js">`. With a caption the class moves
to the figure, because the figure the caption makes owns the attribute line:

````carve
{#lst-icon .diff}
```js
- fileIcon.classList.add("icon-file-text");
+ fileIcon.classList.remove("icon-file-text");
```
^ Listing #: Swap the icon class
````

```html
<figure id="lst-icon" class="diff">
  <pre><code class="language-js">…</code></pre>
  <figcaption>…</figcaption>
</figure>
```

Detect both shapes with the helpers from `@markup-carve/carve-grammars/diff`:
`isDiffFence(pre)` checks one rendered `<pre>`, `findDiffFences(root)` returns
the `<code>` of every diff fence, `DIFF_FENCE_SELECTOR` is the same test as a
CSS selector, and `isDiffCodeBlock(node, parent)` answers it for a Carve AST
`code_block` and its parent `figure`. The same holds for any other class on a
captioned fence, such as `{.scroll}`. A host that has detected a diff fence
invokes the opt-in `diffCodeTransformer()` with the fence language:

```js
import { diffCodeTransformer } from '@markup-carve/carve-grammars/shiki/diff'
import { isDiffFence } from '@markup-carve/carve-grammars/diff'
import '@markup-carve/carve-grammars/shiki/carve.css'

const transformers = isDiffFence(pre)
    ? [diffCodeTransformer()]
    : []

const highlighted = highlighter.codeToHtml(code.textContent, {
    lang: 'javascript',
    theme: 'github-light',
    transformers,
})
```

Create a fresh transformer for every code block. It treats `+`, `-`, and a
space as structural first characters, removes that character while Shiki
tokenizes the underlying language, then restores it and marks added/removed
lines. This first version targets compact instructional changes, not complete
patch files with `@@` hunks or `---` / `+++` file headers. It is deliberately
not enabled by `carveMarkdown()`, because ordinary code blocks must not lose
their first character.

A host that highlights with **highlight.js, Prism, or nothing** - where Shiki's
per-line token model is not available - uses the highlighter-agnostic helper
instead. It takes a per-line highlight callback (or defaults to HTML-escaping)
and produces the same `line` / `diff add` / `diff remove` / `diff-marker`
classes:

```js
import { applyLanguageDiff, findDiffFences } from '@markup-carve/carve-grammars/diff'
import '@markup-carve/carve-grammars/diff/carve-diff.css'

findDiffFences(document).forEach((code) => {
    const language = [...code.classList]
        .find((name) => name.startsWith('language-'))
        ?.slice('language-'.length)
    applyLanguageDiff(code, (body) => hljs.highlight(body, { language }).value)
})
```

`renderLanguageDiff(code, highlightLine)` returns the HTML string if the host
manages the DOM itself (a webview building a document string, a server writing
markup). The marker is stripped before `highlightLine` runs, so the underlying
language tokenizes the line body without its `+`/`-`/space.

## Diagram rendering

Carve engines emit fenced-render diagram blocks as a `<pre class="LANG">source</pre>`
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


## Fence languages

`@markup-carve/carve-grammars/fence-languages.json` (file `fence-languages/fence-languages.json`) lists which grammar a fenced code block embeds, keyed by the word after the fence opener. The `textmate` column matches the fence rules in `textmate/carve.tmLanguage.json`, and the Carve row names `source.carve`. Editor grammars that embed by a fixed table vendor this file; see `fence-languages/README.md` for the columns.
