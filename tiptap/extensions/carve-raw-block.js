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
    // Ahead of the code block's bare `pre` rule, which claimed this element
    // and turned the raw block into code with its plumbing as a run (#531).
    parseHTML() { return [{ tag: 'pre[data-carve-raw-block]', priority: 60 }]; },
    renderHTML({ HTMLAttributes }) {
        return ['pre', mergeAttributes(HTMLAttributes, { 'data-carve-raw-block': 'true' }), ['code', 0]];
    },
});
