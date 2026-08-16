import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** A named Carve symbol. */
export const CarveSymbol = Node.create({
    name: 'carveSymbol',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { name: { default: '' }, ...attributeSlots(['data-carve-symbol']) }; },
    parseHTML() { return [{ tag: 'span[data-carve-symbol]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-symbol': 'true' }), `:${node.attrs.name}:`];
    },
});

export default CarveSymbol;
