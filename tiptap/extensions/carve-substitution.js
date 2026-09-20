import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlineFieldsView } from './editable-atom-view.js';

/** The text a half reads as, for the places that can only show a string. */
function halfText(half) {
    return (half || []).map(node => node.text ?? halfText(node.content)).join('');
}

/** A half typed into the node view's field: literal text, or nothing. */
function halfFromText(value) {
    const text = String(value ?? '').trim();
    return text ? [{ type: 'text', text }] : [];
}

/** An authored CriticMarkup substitution. */
export const CarveSubstitution = Node.create({
    name: 'carveSubstitution',
    group: 'inline',
    inline: true,
    atom: true,
    // Both halves are inline content, so they travel as arrays of inline nodes
    // and an empty half is `[]` (markup-carve/carve#2095). Editing a half in the
    // node view replaces it with the literal text typed there.
    //
    // `rendered: false` because an HTML attribute holds a string: rendered, each
    // half became `[object Object]`, and reading that HTML back crashed
    // `halfText`. HTML is not the interchange format for a substitution - the
    // Carve source and the ProseMirror JSON are - so through HTML the halves
    // come back empty instead of wrong.
    addAttributes() {
        return {
            old: { default: [], rendered: false },
            new: { default: [], rendered: false },
            ...attributeSlots(['data-carve-substitution']),
        };
    },
    parseHTML() { return [{ tag: 'span[data-carve-substitution]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-substitution': 'true' }),
            ['del', halfText(node.attrs.old)], ' → ', ['ins', halfText(node.attrs.new)]];
    },
    addNodeView() {
        return createInlineFieldsView({
            className: 'carve-substitution-editor', label: 'Suggested replacement',
            display: node => `${halfText(node.attrs.old) || '∅'} → ${halfText(node.attrs.new) || '∅'}`,
            fields: [
                { name: 'old', label: 'Original text', multiline: true, read: halfText, write: halfFromText },
                { name: 'new', label: 'Replacement text', multiline: true, read: halfText, write: halfFromText },
            ],
        });
    },
});

export default CarveSubstitution;
