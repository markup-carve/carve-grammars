import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An inline literal whose content is not interpreted as markup. */
export const CarveLiteral = Node.create({
    name: 'carveLiteral',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { content: { default: '' }, ...attributeSlots(['data-carve-literal']) }; },
    parseHTML() { return [{ tag: 'code[data-carve-literal]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['code', mergeAttributes(HTMLAttributes, { 'data-carve-literal': 'true' }), node.attrs.content];
    },
});

export default CarveLiteral;
