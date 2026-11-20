/**
 * Carve 0.2 editor kit for Tiptap: the extensions for the 0.2 tree, a loader from the tree to
 * ProseMirror and a serializer back. The host passes the carve-js engine, so this entry never
 * bundles it.
 *
 * @example
 * ```js
 * import { Editor } from '@tiptap/core'
 * import * as carve from '@markup-carve/carve'
 * import { CarveKit, carveToProseMirror, serializeToCarve } from '@markup-carve/carve-grammars/tiptap'
 *
 * const editor = new Editor({ extensions: [CarveKit], content: carveToProseMirror(source, { engine: carve }) })
 * const next = serializeToCarve(editor.getJSON(), { engine: carve, source })
 * ```
 *
 * @module @markup-carve/carve-grammars/tiptap
 */
export { proseMirrorToTree, proseMirrorToTreeWithOrigins, treeToProseMirror } from './tree.js';
export { carveToProseMirror, serializeToCarve } from './source.js';
export {
    CARVE_MARKS, CARVE_NODES, CarveAdmonition, CarveAttributes, CarveBlock, CarveBlockExtension, CarveCaption,
    CarveCaptioned, CarveCitationDefinition, CarveComment, CarveDefinitionDescription, CarveDefinitionList,
    CarveDefinitionTerm, CarveDelete, CarveDirective, CarveDiv, CarveFigureGroup, CarveFootnote, CarveFootnoteRef,
    CarveFrontmatter, CarveInline, CarveInlineExtension, CarveInlineFootnote, CarveInsert, CarveKit, CarveLine,
    CarveLineBlock, CarveMath, CarveRawBlock, CarveSection, CarveSmallCaps, CarveSoftBreak, CarveSpan, CarveTitle,
} from './extensions.js';
