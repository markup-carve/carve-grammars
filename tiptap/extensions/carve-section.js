import { Node, mergeAttributes } from '@tiptap/core';

/** A rendering section wrapper retaining its heading and body. */
export const CarveSection = Node.create({
    name: 'carveSection',
    group: 'block',
    content: 'block+',
    defining: true,
    parseHTML() { return [{ tag: 'section[data-carve-section]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['section', mergeAttributes(HTMLAttributes, { 'data-carve-section': 'true' }), 0];
    },
});

export default CarveSection;
