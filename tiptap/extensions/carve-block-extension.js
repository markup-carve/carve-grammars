import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/**
 * A block an extension owns, carried with the core fallback CARVE-P12-055
 * requires.
 *
 * The fallback is the node's CONTENT, not an attribute: it is a real block the
 * editor edits, and it is what the document means to a reader that does not
 * implement the extension. `content: 'block'` is the schema stating the clause's
 * cardinality - one fallback, always present.
 *
 * `payload` stays opaque. `format` names how `value` is encoded so a reader can
 * tell whether it can parse it at all; no core target renders it.
 */
export const CarveBlockExtension = Node.create({
    name: 'carveBlockExtension',
    group: 'block',
    content: 'block',
    defining: true,
    addAttributes() {
        return {
            name: { default: '' },
            version: { default: null },
            // An HTML attribute holds a string, and the payload is an object:
            // rendered, it became `[object Object]` and reading that HTML back
            // produced garbage. HTML is not the interchange format for an
            // extension payload - the ProseMirror JSON is - so through HTML the
            // payload comes back absent instead of wrong, the same call
            // `carveSubstitution` makes for its halves.
            payload: { default: null, rendered: false },
            ...attributeSlots(['name', 'version', 'data-carve-block-extension']),
        };
    },
    parseHTML() { return [{ tag: 'div[data-carve-block-extension]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-carve-block-extension': 'true' }), 0];
    },
});

export default CarveBlockExtension;
