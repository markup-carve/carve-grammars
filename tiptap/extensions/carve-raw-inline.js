import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** An opaque raw inline with its target format. */
export const CarveRawInline = Node.create({
    name: 'carveRawInline',
    group: 'inline',
    inline: true,
    content: 'text*',
    marks: '',
    addAttributes() {
        return { content: { default: null }, format: { default: '' }, ...attributeSlots(['content', 'format', 'data-carve-raw-inline']) };
    },
    // Above the default 50: the Code mark claims any <code>, and it would
    // then read this node's marker and format as an authored key/value run.
    parseHTML() { return [{ tag: 'code[data-carve-raw-inline]', priority: 60 }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['code', mergeAttributes(HTMLAttributes, { 'data-carve-raw-inline': 'true' }), 0];
    },
});

export default CarveRawInline;
