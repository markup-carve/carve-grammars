import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An inline literal whose content is not interpreted as markup. */
export const CarveLiteral = Node.create({
    name: 'carveLiteral',
    group: 'inline',
    inline: true,
    content: 'text*',
    marks: '',
    addAttributes() { return { content: { default: null }, ...attributeSlots(['data-carve-literal']) }; },
    parseHTML() { return [{ tag: 'code[data-carve-literal]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['code', mergeAttributes(HTMLAttributes, { 'data-carve-literal': 'true' }), 0];
    },
});

export default CarveLiteral;
