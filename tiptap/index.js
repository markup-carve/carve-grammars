/**
 * Carve Grammars - Tiptap Integration
 *
 * Provides Carve markup support for Tiptap editors.
 *
 * @example Basic usage with CarveKit
 * ```js
 * import { Editor } from '@tiptap/core'
 * import { CarveKit, serializeToCarve } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   element: document.getElementById('editor'),
 *   extensions: [CarveKit],
 *   onUpdate: ({ editor }) => {
 *     const carve = serializeToCarve(editor.getJSON())
 *     console.log(carve)
 *   },
 * })
 * ```
 *
 * @example Using individual extensions
 * ```js
 * import { Editor } from '@tiptap/core'
 * import StarterKit from '@tiptap/starter-kit'
 * import { CarveInsert, CarveDelete, CarveDiv, serializeToCarve } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [
 *     StarterKit,
 *     CarveInsert,
 *     CarveDelete,
 *     CarveDiv,
 *   ],
 * })
 * ```
 *
 * @module carve-grammars/tiptap
 */

// Main kit
export { CarveKit } from './carve-kit.js';

// Individual extensions
export { CarveInsert } from './extensions/carve-insert.js';
export { CarveDelete } from './extensions/carve-delete.js';
export { CarveDiv } from './extensions/carve-div.js';
export { CarveMath } from './extensions/carve-math.js';
export { CarveFootnoteDefinition } from './extensions/carve-footnote-definition.js';

// Serializer
export { serializeToCarve, escapeCarve } from './serializer.js';
