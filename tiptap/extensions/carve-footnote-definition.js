import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Carve Footnote Definition node for Tiptap.
 *
 * A block that holds a footnote's body, paired with an inline `[^label]`
 * reference (see CarveFootnote). Serializes to Carve as:
 *
 * ```
 * [^label]: the footnote body
 * ```
 *
 * Hosts typically collect these at the end of the document. The body is regular
 * block content (`paragraph+`).
 *
 * @example
 * ```js
 * import { CarveFootnoteDefinition } from 'carve-grammars/tiptap'
 *
 * editor.chain().focus().insertCarveFootnoteDefinition({ label: '1' }).run()
 * ```
 */
export const CarveFootnoteDefinition = Node.create({
    name: 'carveFootnoteDefinition',

    group: 'block',

    content: 'paragraph+',

    defining: true,

    addAttributes() {
        return {
            label: {
                default: 'note',
                parseHTML: element => element.getAttribute('data-footnote-label') || 'note',
                renderHTML: attributes => ({ 'data-footnote-label': attributes.label }),
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'li[data-footnote-label]' },
            { tag: 'section.carve-footnotes > ol > li' },
        ];
    },

    renderHTML({ HTMLAttributes, node }) {
        return ['li', mergeAttributes(HTMLAttributes, {
            class: 'carve-footnote-definition',
            'data-footnote-label': node.attrs.label,
        }), 0];
    },

    addCommands() {
        return {
            insertCarveFootnoteDefinition: attributes => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: attributes,
                    content: [{ type: 'paragraph' }],
                });
            },
        };
    },
});

export default CarveFootnoteDefinition;
