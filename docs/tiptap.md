# Tiptap kit

`@markup-carve/carve-grammars/tiptap` edits Carve 0.2 in Tiptap 2 or 3. It has three parts:

- `CarveKit`: the Tiptap extensions for the 0.2 tree.
- `treeToProseMirror(tree)` and `carveToProseMirror(source, { engine })`: the loader from the carve-js tree to ProseMirror JSON.
- `proseMirrorToTree(json)` and `serializeToCarve(json, { engine, source })`: the way back to the tree, written to source by the carve-js writer.

The kit does not import carve-js. You pass it the engine you already bundle (`import * as carve from '@markup-carve/carve'`). The kit needs `parse`, `write` and `treesEqual`.

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
- After an edit, the top-level blocks the edit did not touch keep their original text. The carve-js writer writes the changed blocks. If the spliced result does not read back as the writer's own output, the kit returns the writer's output for the whole tree instead.

Without `source`, `serializeToCarve` returns the writer's output. When the writer cannot spell an edited tree, the engine's `CarveWriteError` is thrown, for example for text typed directly against a symbol.

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
| `math`, `footnote_ref`, `image`, `hard_break` | `carveMath` (`value`, `display`), `carveFootnoteRef` (`key`), `image`, `hardBreak` |
| `strong`, `emphasis`, `underline`, `strike`, `highlight`, `superscript`, `subscript`, `code`, `link` | the marks `bold`, `italic`, `underline`, `strike`, `highlight`, `superscript`, `subscript`, `code`, `link` |
| `insert`, `delete`, `small_caps`, `span`, `inline_footnote`, `inline_extension` | the marks `carveInsert`, `carveDelete`, `carveSmallCaps`, `carveSpan`, `carveInlineFootnote`, `carveInlineExtension` |
| any other node | `carveBlock` or `carveInline`, an atom that keeps the whole node |

Every node and mark has a `carve` attribute. It holds the tree fields the editor does not edit: attributes, list markers, task marks (`data-task-state` in the HTML), keys, captions' short forms. A task item keeps its mark (`[?]`, `[-]`) until its checkbox is toggled, which writes `[x]` or `[ ]`. Splitting a node does not copy `carve`, so a new paragraph does not inherit an id.

The loader and the serializer round-trip every 0.2 conformance example and clause case: parse, load, edit nothing, serialize gives the same tree.
