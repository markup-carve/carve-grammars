import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An authored reference to a heading target. */
export const CarveCrossref = Node.create({
    name: 'carveCrossref',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { target: { default: '' }, ...attributeSlots(['data-carve-crossref']) }; },
    parseHTML() { return [{ tag: 'span[data-carve-crossref]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-crossref': 'true' }), `</#${node.attrs.target}>`];
    },
});

export default CarveCrossref;
