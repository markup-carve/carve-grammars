import Heading from '@tiptap/extension-heading';
import { mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** Tiptap heading that retains Carve's authored attribute run. */
export const CarveHeading = Heading.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            ...attributeSlots(),
            id: {
                default: null,
                // Rendered Carve HTML puts generated ids on headings inside
                // containers. HTML does not say whether an id was authored, so
                // importing it would invent `{#slug}` on a round trip. Source
                // conversion sets this schema attribute directly when authored.
                parseHTML: () => null,
                renderHTML: attributes => attributes.id ? { id: attributes.id } : {},
            },
        };
    },

    renderHTML({ node, HTMLAttributes }) {
        const level = this.options.levels.includes(node.attrs.level)
            ? node.attrs.level
            : this.options.levels[0];
        return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },
});

export default CarveHeading;
