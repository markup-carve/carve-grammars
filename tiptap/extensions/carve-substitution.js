import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlineFieldsView } from './editable-atom-view.js';

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
    addNodeView() {
        return createInlineFieldsView({
            className: 'carve-substitution-editor', label: 'Suggested replacement',
            display: node => `${node.attrs.oldText || '∅'} → ${node.attrs.newText || '∅'}`,
            fields: [
                { name: 'oldText', label: 'Original text', multiline: true },
                { name: 'newText', label: 'Replacement text', multiline: true },
            ],
        });
    },
});

export default CarveSubstitution;
