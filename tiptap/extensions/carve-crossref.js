import { Node, mergeAttributes } from '@tiptap/core';

/** An authored reference to a heading target. */
export const CarveCrossref = Node.create({
    name: 'carveCrossref',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { target: { default: '' } }; },
    parseHTML() { return [{ tag: 'span[data-carve-crossref]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-crossref': 'true' }), `</#${node.attrs.target}>`];
    },
});

export default CarveCrossref;
