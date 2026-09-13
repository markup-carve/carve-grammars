import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlinePickerView, documentHeadingValues } from './editable-atom-view.js';

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
    addNodeView() {
        return createInlinePickerView({
            className: 'carve-crossref-picker', label: 'Cross-reference target', attribute: 'target',
            value: node => `</#${node.attrs.target || ''}>`,
            choices: documentHeadingValues,
        });
    },
});

export default CarveCrossref;
