import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An opaque raw inline with its target format. */
export const CarveRawInline = Node.create({
    name: 'carveRawInline',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
        return { content: { default: '' }, format: { default: '' }, ...attributeSlots(['data-carve-raw-inline']) };
    },
    parseHTML() { return [{ tag: 'code[data-carve-raw-inline]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['code', mergeAttributes(HTMLAttributes, { 'data-carve-raw-inline': 'true' }), node.attrs.content];
    },
});

export default CarveRawInline;
