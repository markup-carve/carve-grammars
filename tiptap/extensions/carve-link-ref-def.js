import { Node, mergeAttributes } from '@tiptap/core';

/** An authored link reference definition. */
export const CarveLinkRefDef = Node.create({
    name: 'carveLinkRefDef',
    group: 'block',
    atom: true,
    addAttributes() {
        return { label: { default: '' }, href: { default: '' }, title: { default: null } };
    },
    parseHTML() { return [{ tag: 'div[data-carve-link-ref-def]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-carve-link-ref-def': 'true' }), `[${node.attrs.label}]: ${node.attrs.href}`];
    },
});

export default CarveLinkRefDef;
