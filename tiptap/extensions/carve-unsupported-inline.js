import { Node, mergeAttributes } from '@tiptap/core';

/** Exact source for an inline construct that has no faithful editor model yet. */
export const CarveUnsupportedInline = Node.create({
    name: 'carveUnsupportedInline',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            // The TYPE this atom stands in for. Without it a caller can see
            // that something was preserved and never learn what.
            carveType: {
                default: '',
                parseHTML: element => element.getAttribute('data-carve-type') || '',
                renderHTML: attributes => (attributes.carveType ? { 'data-carve-type': attributes.carveType } : {}),
            },
            carveSource: {
                default: '',
                parseHTML: element => element.getAttribute('data-carve-source') || '',
                renderHTML: attributes => ({ 'data-carve-source': attributes.carveSource || '' }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-carve-unsupported-inline]' }];
    },

    renderHTML({ HTMLAttributes, node }) {
        return [
            'span',
            mergeAttributes(HTMLAttributes, { 'data-carve-unsupported-inline': 'true' }),
            node.attrs.carveSource || '',
        ];
    },
});

export default CarveUnsupportedInline;
