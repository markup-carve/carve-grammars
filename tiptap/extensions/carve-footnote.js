import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Carve Footnote node extension for Tiptap
 *
 * Renders as [^label] in Carve markup
 *
 * @example
 * ```js
 * import { CarveFootnote } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveFootnote],
 * })
 *
 * // Insert a footnote reference
 * editor.chain().focus().insertCarveFootnote({ label: 'note1' }).run()
 * ```
 */
export const CarveFootnote = Node.create({
    name: 'carveFootnote',

    group: 'inline',

    inline: true,

    atom: true,

    addAttributes() {
        return {
            label: {
                default: 'note',
                parseHTML: element => element.getAttribute('data-footnote-label') || element.textContent?.replace(/[[\]^]/g, '') || 'note',
                renderHTML: attributes => {
                    return { 'data-footnote-label': attributes.label };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'sup.carve-footnote' },
            { tag: 'span.carve-footnote-ref' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const label = HTMLAttributes['data-footnote-label'] || 'note';
        return ['sup', mergeAttributes(HTMLAttributes, {
            class: 'carve-footnote',
            'data-footnote-label': label,
            contenteditable: 'false',
        }), `[^${label}]`];
    },

    addCommands() {
        return {
            insertCarveFootnote: (attributes) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: attributes,
                });
            },
        };
    },
});

export default CarveFootnote;
