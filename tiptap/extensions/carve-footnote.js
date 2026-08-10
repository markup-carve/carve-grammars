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
            carveSource: { default: null, rendered: false },
            label: {
                default: 'note',
                parseHTML: element => element.getAttribute('data-footnote-label')
                    || element.textContent?.replace(/[[\]^]/g, '').trim()
                    // carve-php / carve-js reference: id="fnrefN".
                    || element.id.replace(/^fnref/, '')
                    || 'note',
                renderHTML: attributes => {
                    return { 'data-footnote-label': attributes.label };
                },
            },
        };
    },

    parseHTML() {
        return [
            // Both selectors overlap extensions registered by CarveKit:
            // Superscript claims every <sup>, while other inline extensions may
            // claim a generic <span>. Resolve the Carve-specific shape first.
            { tag: 'sup.carve-footnote', priority: 60 },
            { tag: 'span.carve-footnote-ref', priority: 60 },
            // carve-php / carve-js render the reference as
            // <a id="fnrefN" role="doc-noteref"><sup>N</sup></a>. Beat Link to it.
            { tag: 'a[role="doc-noteref"]', priority: 60 },
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
