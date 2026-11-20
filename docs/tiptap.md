# Tiptap kit

`@markup-carve/carve-grammars/tiptap` edits Carve 0.2 in Tiptap 2 or 3. It has three parts:

- `CarveKit`: the Tiptap extensions for the 0.2 tree.
- `treeToProseMirror(tree)` and `carveToProseMirror(source, { engine })`: the loader from the carve-js tree to ProseMirror JSON.
- `proseMirrorToTree(json)` and `serializeToCarve(json, { engine, source })`: the way back to the tree, written to source by the carve-js writer.

The kit does not import carve-js. You pass it the engine you already bundle (`import * as carve from '@markup-carve/carve'`). The kit needs `parse` and `write`, and uses `treesEqual` and `parseWithLayout` when the engine has them.

## Loading and saving

```js
import { Editor } from '@tiptap/core'
import * as carve from '@markup-carve/carve'
import { CarveKit, carveToProseMirror, serializeToCarve } from '@markup-carve/carve-grammars/tiptap'

const editor = new Editor({ extensions: [CarveKit], content: carveToProseMirror(source, { engine: carve }) })

// Later, or in onUpdate:
const next = serializeToCarve(editor.getJSON(), { engine: carve, source })
```

To replace the content of a running editor, use `editor.commands.setCarveContent(json)`. Tiptap's `setContent` keeps the old doc node's attributes, and those hold the document's own fields, such as extension declarations.

With `source`:

- An unedited document returns `source` byte for byte.
- After an edit, the top-level blocks the edit did not touch keep their original text. The carve-js writer writes the changed blocks. A changed block that stands where an original block of the same type stood is written with that block's layout (the engine's `parseWithLayout`), so the writer keeps its fence and marker spelling where it can. If the spliced result does not read back as the writer's own output, the kit returns the writer's output for the whole tree instead.

Without `source`, `serializeToCarve` returns the writer's output. When the writer cannot spell an edited tree, the engine's `CarveWriteError` is thrown, for example for text typed directly against a symbol.

## Denied destinations

A link `href` or image `src` that the HTML renderer's URL policy denies (`javascript:`, `data:` and the rest of the engine's `DEFAULT_DENIED_SCHEMES`) is `null` in the editor attribute, so the editor never renders it. The value stays in the node's `carve` attribute, and the way back restores it, so the tree and the source are unchanged. Pass `urlPolicy` (`{ deny }` or `{ allow }`, as for carve-js `render`) to `treeToProseMirror(tree, { urlPolicy })` or `carveToProseMirror(source, { engine, urlPolicy })` to change the policy.

## What the editor shows

| Carve 0.2 node | ProseMirror |
|---|---|
| `paragraph`, `heading`, `block_quote`, `code_block`, `thematic_break` | `paragraph`, `heading`, `blockquote`, `codeBlock` (`language` is the fence info), `horizontalRule` |
| `list`, `list_item` | `bulletList`, `orderedList`, `listItem`; `taskList`, `taskItem` when every item has a task |
| `table` and its rows and cells | `table`, `tableRow`, `tableHeader`, `tableCell` |
| `div`, `admonition` (`kind`), `directive` | `carveDiv`, `carveAdmonition`, `carveDirective`, with the title as a leading `carveTitle` |
| a node with a `caption` | `carveCaptioned`: the node, then its `carveCaption` |
| `figure_group`, `section`, `footnote`, `block_extension` | `carveFigureGroup`, `carveSection`, `carveFootnote`, `carveBlockExtension` |
| `definition_list` | `carveDefinitionList` with `carveDefinitionTerm` and `carveDefinitionDescription` |
| `line_block`, `line` | `carveLineBlock`, `carveLine` |
| `comment`, `raw_block`, `frontmatter` | `carveComment`, `carveRawBlock`, `carveFrontmatter`, edited as plain text |
| `math`, `footnote_ref`, `image`, `hard_break`, `soft_break` | `carveMath` (`value`, `display`), `carveFootnoteRef` (`key`, shown as a superscript label), `image`, `hardBreak`, `carveSoftBreak` |
| `strong`, `emphasis`, `underline`, `strike`, `highlight`, `superscript`, `subscript`, `code`, `link` | the marks `bold`, `italic`, `underline`, `strike`, `highlight`, `superscript`, `subscript`, `code`, `link` |
| `insert`, `delete`, `small_caps`, `span`, `inline_footnote`, `inline_extension` | the marks `carveInsert`, `carveDelete`, `carveSmallCaps`, `carveSpan`, `carveInlineFootnote`, `carveInlineExtension` |
| any other node | `carveBlock` or `carveInline`, an atom that keeps the whole node |

A `soft_break`, the line end inside a wrapped paragraph, is the inline leaf `carveSoftBreak`. It renders as `<span data-carve-soft-break> </span>`, so the editor shows a space where HTML shows one, and the cursor passes it as one character. `getText()` and the plain-text clipboard give a space. Copy and paste inside the editor goes through that span and keeps the break. Plain text pasted from outside has no break to keep: its spaces and line ends are text, so the pasted paragraph saves as one line.

Every node and mark has a `carve` attribute. It holds the tree fields the editor does not edit: attributes, list markers, task marks (`data-task-state` in the HTML), keys, captions' short forms. A task item keeps its mark (`[?]`, `[-]`) until its checkbox is toggled, which writes `[x]` or `[ ]`. Splitting a node does not copy `carve`, so a new paragraph does not inherit an id. A list item or caption the editor leaves empty (what Enter or a list toggle leaves behind) is not written, unless the loaded document had it empty.

## Content from a stock Tiptap editor

The way back also reads what a Tiptap setup without the kit's own content makes:

- A cell's `colspan` and `rowspan` attributes are the Carve spans: the cell's counts and the `<` and `^` marks of the cells it covers. On load the counts go to those attributes, so the editor shows the merged cell. A row span stops at the end of its table group, and a cell that spans rows and columns keeps only its columns, since a `^` below a cell of more than one column joins nothing.
- In a table without a head, the leading rows whose cells are all `tableHeader` are the head, as they are when the written source is parsed.
- A block-level `image` (Tiptap's Image default) is an image paragraph, the tree of `![alt](src)`.

`proseMirrorToTreeWithOrigins(json).ignored` lists every attribute the save did not read, as `{ path, type, attribute, value }` with `path` a JSON pointer into `json`, for example the `textAlign` of a TextAlign extension, a link's `target` or the `colwidth` of a resized column. Null values and the defaults the kit's Link gives every link are not listed. A host that must not lose editor state can refuse a save when the list is not empty.

The loader and the serializer round-trip every 0.2 conformance example and clause case: parse, load, edit nothing, serialize gives the same tree.
