import { Node, mergeAttributes } from '@tiptap/core';

/** An authored citation group carried opaquely by the editor. */
export const CarveCitation = Node.create({
    name: 'carveCitation',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
        return { raw: { default: '' }, integral: { default: false }, items: { default: null } };
    },
    parseHTML() { return [{ tag: 'span[data-carve-citation]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-citation': 'true' }), node.attrs.raw];
    },
});

export default CarveCitation;
