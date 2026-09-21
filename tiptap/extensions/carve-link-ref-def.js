import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createDefinitionCardView } from './editable-atom-view.js';

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
            ...attributeSlots(['label', 'href', 'title', 'data-carve-link-ref-def']),
        };
    },
    // Above the default 50: CarveDiv claims any div with a single-word class,
    // and a definition carrying an authored `{.external}` is exactly that. A div
    // that declares which Carve node it is outranks a shape match.
    parseHTML() { return [{ tag: 'div[data-carve-link-ref-def]', priority: 60 }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-carve-link-ref-def': 'true' }), `[${node.attrs.label}]: ${node.attrs.href}`];
    },
    addNodeView() {
        return createDefinitionCardView({
            className: 'carve-link-definition-card', title: 'Link definition',
            fields: [{ name: 'label', label: 'Label' }, { name: 'href', label: 'Destination' }, { name: 'title', label: 'Title' }],
        });
    },
});

export default CarveLinkRefDef;
