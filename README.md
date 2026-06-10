# Carve Grammars

Tiptap integration for the [Carve](https://github.com/markup-carve/carve) markup language: an editor kit plus a serializer that turns a Tiptap/ProseMirror document into Carve markup.

Modeled on [djot-grammars](https://github.com/php-collective/djot-grammars), adapted to Carve's syntax. The mark mapping mirrors `carve-php`'s `HtmlToCarve` converter, which is the canonical HTML-element to Carve-token reference.

> **Status:** Tiptap integration plus a highlight.js grammar. TextMate / Prism grammars are not ported yet.

## Install

```bash
npm install carve-grammars
```

Peer dependencies: `@tiptap/core` and `@tiptap/starter-kit` (v2).

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

## Syntax highlighting (highlight.js)

`highlightjs/carve.js` registers a `carve` language with [highlight.js](https://highlightjs.org/). Loaded as a plain `<script>` after highlight.js it self-registers; it also exports the definition for module systems.

```html
<script src="highlight.min.js"></script>
<script src="node_modules/carve-grammars/highlightjs/carve.js"></script>
<script>hljs.highlightAll();</script>
```

```js
import hljs from 'highlight.js/lib/core'
import carve from 'carve-grammars/highlightjs/carve.js'

hljs.registerLanguage('carve', carve)
```

Highlights Carve inline tokens (`*strong*`, `/emphasis/`, `_underline_`, `~strike~`, `==highlight==`, `,,sub,,`, `^sup^`, `` `code` ``, `{+ins+}`, `{-del-}`), headings, fenced code, container divs (`:::`), tables, links/references, attributes, and autolinks.

## Mark mapping

| Tiptap mark | Carve token | Renders as |
|-------------|-------------|------------|
| bold        | `*text*`    | `<strong>` |
| italic      | `/text/`    | `<em>`     |
| code        | `` `text` `` | `<code>`  |
| highlight   | `==text==`  | `<mark>`   |
| strike      | `~text~`    | `<s>`      |
| subscript   | `,,text,,`  | `<sub>`    |
| superscript | `^text^`    | `<sup>`    |
| insert      | `{+text+}`  | `<ins>`    |
| link        | `[text](url)` | `<a>`    |
| span        | `[text]{.class}` | `<span class>` |
| abbreviation | `[text]{abbr="..."}` | `<span abbr>` |

The tokens target carve-php's **parser** (the contract: serialized Carve must parse
back to the same elements). Carve's inline syntax differs notably from Djot's:
emphasis is `/text/` (Djot uses `_`), `_text_` is underline, `~text~` is
strikethrough, subscript is `,,text,,`, and highlight is `==text==`.

## Block elements

Headings (`#`), bullet / ordered / task lists, blockquotes (`>`), fenced code
blocks (`` ``` lang ``), horizontal rules (`---`), tables, container divs
(`::: class`), and definition lists.

## API

- `serializeToCarve(doc)` - serialize an `editor.getJSON()` document to Carve markup.
- `escapeCarve(text)` - escape Carve special characters in plain text.
- `CarveKit` - the bundled Tiptap extension set.
- Individual extensions: `CarveInsert`, `CarveDelete`, `CarveDiv`, `CarveSpan`, `CarveFootnote`, `CarveEmbed`, `CarveAbbreviation`, `CarveDefinitionList`.

## Tests

```bash
npm test
```

## License

MIT
