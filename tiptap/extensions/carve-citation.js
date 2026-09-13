import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlinePickerView, documentValues } from './editable-atom-view.js';

/** An authored citation group carried opaquely by the editor. */
export const CarveCitation = Node.create({
    name: 'carveCitation',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
        return { raw: { default: '' }, integral: { default: false }, items: { default: null }, ...attributeSlots(['data-carve-citation']) };
    },
    parseHTML() { return [{ tag: 'span[data-carve-citation]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-citation': 'true' }), node.attrs.raw];
    },
    addNodeView() {
        return createInlinePickerView({
            className: 'carve-citation-picker', label: 'Citation source', attribute: 'raw',
            value: node => node.attrs.raw || '[@citation]',
            choices: editor => documentValues(editor, 'carveCitationDefinition', 'key').map(key => `[@${key}]`),
        });
    },
});

export default CarveCitation;
