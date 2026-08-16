import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/**
 * An inline extension - `:name[content]`.
 *
 * Distinct from `carveEmbed`, which is a BLOCK atom for a media directive. An
 * inline extension is inline content with editable children, so a shared node
 * could not hold both: `:kbd[Ctrl+C]` sits inside a sentence, and a video embed
 * does not.
 */
export const CarveInlineExtension = Node.create({
    name: 'carveInlineExtension',
    group: 'inline',
    inline: true,
    content: 'inline*',

    addAttributes() {
        return {
            name: {
                default: '',
                parseHTML: element => element.getAttribute('data-carve-extension') || '',
                renderHTML: attributes => ({ 'data-carve-extension': attributes.name || '' }),
            },
            ...attributeSlots(['data-carve-extension']),
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-carve-extension]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes), 0];
    },
});

export default CarveInlineExtension;
