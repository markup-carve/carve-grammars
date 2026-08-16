import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An authored link reference definition. */
export const CarveLinkRefDef = Node.create({
    name: 'carveLinkRefDef',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            label: { default: '' },
            href: { default: '' },
            title: { default: null },
            // A definition line takes a TRAILING attribute run of its own
            // (`[ex]: /u {.external}`), which transfers to every link that
            // resolves the label. Without slots for it the run is dropped the
            // moment the document is mounted in an editor.
            ...attributeSlots(['data-carve-link-ref-def']),
        };
    },
    parseHTML() { return [{ tag: 'div[data-carve-link-ref-def]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-carve-link-ref-def': 'true' }), `[${node.attrs.label}]: ${node.attrs.href}`];
    },
});

export default CarveLinkRefDef;
