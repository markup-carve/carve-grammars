import { Node, mergeAttributes } from '@tiptap/core';

export const CarveRawBlock = Node.create({
    name: 'carveRawBlock',
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    addAttributes() {
        return { format: { default: '' } };
    },
    parseHTML() { return [{ tag: 'pre[data-carve-raw-block]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['pre', mergeAttributes(HTMLAttributes, { 'data-carve-raw-block': 'true' }), ['code', 0]];
    },
});
