import { Node, mergeAttributes } from '@tiptap/core';

/**
 * A Carve mark whose content is EMPTY.
 *
 * A ProseMirror mark needs text to attach to, so `[](https://example.com)`,
 * `[]{.a}`, `{++}` and `{--}` had nowhere to land: the converter walked their
 * (empty) children, produced nothing, and the construct disappeared from the
 * document. Nothing reported it, so `[](https://example.com)` alone in a file
 * came back as an EMPTY DOCUMENT - the most severe shape a bridge can produce,
 * delivered in silence (markup-carve/carve-grammars#240).
 *
 * The mark rides on an atom instead. `markType` is the ProseMirror mark it
 * stands for and `markAttrs` is that mark's attribute set, so the
 * serializer writes back the same construct with the same destination, title and
 * attribute run - no source blob, and the attributes stay editable.
 */
export const CarveEmptyMark = Node.create({
    name: 'carveEmptyMark',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            markType: {
                default: '',
                parseHTML: element => element.getAttribute('data-carve-empty-mark') || '',
                renderHTML: attributes => (attributes.markType
                    ? { 'data-carve-empty-mark': attributes.markType }
                    : {}),
            },
            // One map rather than a slot per attribute: which attributes exist
            // depends on which mark this stands for, and a link's `href` has no
            // meaning on a span.
            markAttrs: {
                default: null,
                parseHTML: (element) => {
                    const raw = element.getAttribute('data-carve-mark-attrs');
                    if (!raw) return null;
                    try {
                        const parsed = JSON.parse(raw);

                        return parsed && typeof parsed === 'object' ? parsed : null;
                    } catch {
                        return null;
                    }
                },
                renderHTML: attributes => (attributes.markAttrs
                    ? { 'data-carve-mark-attrs': JSON.stringify(attributes.markAttrs) }
                    : {}),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-carve-empty-mark]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-empty-mark-node': 'true' })];
    },
});

export default CarveEmptyMark;
