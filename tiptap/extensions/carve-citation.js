import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlinePickerView, documentValues } from './editable-atom-view.js';

/** An authored citation group carried opaquely by the editor. */
export const CarveCitation = Node.create({
    name: 'carveCitation',
    group: 'inline',
    inline: true,
    atom: true,
    // `items` is an array of parsed citation items, so it cannot travel in an
    // HTML attribute: rendered, it became `[object Object],[object Object]`,
    // which the attribute-run slot read back and wrote into the Carve source as
    // an authored `{items="..."}` run. The source and the ProseMirror JSON
    // carry the items; HTML does not.
    addAttributes() {
        return { raw: { default: '' }, integral: { default: false }, items: { default: null, rendered: false }, ...attributeSlots(['data-carve-citation']) };
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
            navigate: Object.assign((node, editor) => {
                const key = String(node.attrs.raw || '').match(/@([\w:.+-]+)/)?.[1];
                const target = [...editor.options.element.querySelectorAll('[data-carve-citation-definition]')]
                    .find(element => element.getAttribute('key') === key);
                target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, { label: 'Open definition' }),
        });
    },
});

export default CarveCitation;
