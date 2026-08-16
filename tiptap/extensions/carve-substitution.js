import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An authored CriticMarkup substitution. */
export const CarveSubstitution = Node.create({
    name: 'carveSubstitution',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
        return { oldText: { default: '' }, newText: { default: '' }, ...attributeSlots(['data-carve-substitution']) };
    },
    parseHTML() { return [{ tag: 'span[data-carve-substitution]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-substitution': 'true' }),
            ['del', node.attrs.oldText], ' → ', ['ins', node.attrs.newText]];
    },
});

export default CarveSubstitution;
