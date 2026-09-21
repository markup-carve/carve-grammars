import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlinePickerView, documentHeadingValues } from './editable-atom-view.js';

/** An authored reference to a heading target. */
export const CarveCrossref = Node.create({
    name: 'carveCrossref',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { target: { default: '' }, ...attributeSlots(['target', 'data-carve-crossref']) }; },
    parseHTML() { return [{ tag: 'span[data-carve-crossref]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-crossref': 'true' }), `</#${node.attrs.target}>`];
    },
    addNodeView() {
        return createInlinePickerView({
            className: 'carve-crossref-picker', label: 'Cross-reference target', attribute: 'target',
            value: node => `</#${node.attrs.target || ''}>`,
            choices: documentHeadingValues,
            navigate: Object.assign((node, editor) => {
                const target = [...editor.options.element.querySelectorAll('h1,h2,h3,h4,h5,h6')]
                    .find(element => element.id === node.attrs.target || element.textContent.trim().replace(/\s+/g, '-') === node.attrs.target);
                target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, { label: 'Open heading' }),
        });
    },
});

export default CarveCrossref;
