import { Node, mergeAttributes } from '@tiptap/core';

/** An inline footnote whose authored content remains editable. */
export const CarveInlineNote = Node.create({
    name: 'carveInlineNote',
    group: 'inline',
    inline: true,
    content: 'inline*',
    parseHTML() { return [{ tag: 'span[data-carve-inline-note]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-inline-note': 'true' }), 0];
    },
});

export default CarveInlineNote;
