import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlineFieldsView } from './editable-atom-view.js';

/** A named Carve symbol. */
export const CarveSymbol = Node.create({
    name: 'carveSymbol',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() { return { name: { default: '' }, ...attributeSlots(['name', 'data-carve-symbol']) }; },
    // Above the default 50: CarveSpan claims any span with a simple class.
    parseHTML() { return [{ tag: 'span[data-carve-symbol]', priority: 60 }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-symbol': 'true' }), `:${node.attrs.name}:`];
    },
    addNodeView() {
        return createInlineFieldsView({
            className: 'carve-symbol-editor', label: 'Symbol',
            display: node => `:${node.attrs.name || ''}:`,
            fields: [{ name: 'name', label: 'Symbol name' }],
        });
    },
});

export default CarveSymbol;
