import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Opaque Carve source that the ProseMirror model cannot edit faithfully yet.
 *
 * The loader uses this only in `unsupported: 'preserve'` mode. The serializer
 * writes `carveSource` back verbatim so unsupported constructs survive a
 * load/save pass.
 */
export const CarveUnsupported = Node.create({
    name: 'carveUnsupported',

    group: 'block',

    atom: true,

    addAttributes() {
        return {
            carveSource: {
                default: '',
                parseHTML: element => element.getAttribute('data-carve-source') || '',
                renderHTML: attributes => ({ 'data-carve-source': attributes.carveSource || '' }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'pre[data-carve-unsupported]' }];
    },

    renderHTML({ HTMLAttributes, node }) {
        return [
            'pre',
            mergeAttributes(HTMLAttributes, { 'data-carve-unsupported': 'true' }),
            node.attrs.carveSource || '',
        ];
    },
});

export default CarveUnsupported;
