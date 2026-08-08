import { Node, mergeAttributes } from '@tiptap/core';

export const CarveLineBlock = Node.create({
    name: 'carveLineBlock',
    group: 'block',
    content: 'block+',
    defining: true,
    addAttributes() { return { mode: { default: '|' } }; },
    parseHTML() { return [{ tag: 'div[data-carve-line-block]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-carve-line-block': 'true' }), 0];
    },
});
