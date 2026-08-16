import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An inline footnote whose authored content remains editable. */
export const CarveInlineNote = Node.create({
    name: 'carveInlineNote',
    group: 'inline',
    inline: true,
    content: 'inline*',
    addAttributes() { return attributeSlots(['data-carve-inline-note']); },
    parseHTML() { return [{ tag: 'span[data-carve-inline-note]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-inline-note': 'true' }), 0];
    },
});

export default CarveInlineNote;
