import { Node, mergeAttributes } from '@tiptap/core';
import { createInlinePickerView, documentValues } from './editable-atom-view.js';
import { attributeSlots } from './carve-attribute-slots.js';

/**
 * Carve Footnote node extension for Tiptap
 *
 * Renders as [^label] in Carve markup
 *
 * @example
 * ```js
 * import { CarveFootnote } from '@markup-carve/carve-grammars/tiptap'
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
        // The reference's own attribute run (`[^1]{.x}`). Read back only from
        // the editor's own element: an engine `<a role="doc-noteref">` carries
        // generated ids and roles, not authored ones.
        const slots = attributeSlots(['data-footnote-label', 'contenteditable']);
        const own = element => element.classList?.contains('carve-footnote');
        const authored = Object.fromEntries(Object.entries(slots).map(([name, slot]) => [name, {
            ...slot,
            parseHTML: element => {
                if (!own(element)) return null;
                if (name !== 'class') return slot.parseHTML(element);
                const classes = String(element.getAttribute('class') || '').split(/\s+/)
                    .filter(c => c && c !== 'carve-footnote');
                return classes.length ? classes.join(' ') : null;
            },
        }]));
        return {
            ...authored,
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

    addNodeView() {
        return createInlinePickerView({
            className: 'carve-footnote-picker',
            label: 'Footnote target',
            attribute: 'label',
            value: node => `[^${node.attrs.label || 'note'}]`,
            choices: editor => documentValues(editor, 'carveFootnoteDefinition', 'label'),
            navigate: Object.assign((node, editor) => {
                const target = [...editor.options.element.querySelectorAll('[data-footnote-label]')]
                    .find(element => element.getAttribute('data-footnote-label') === node.attrs.label
                        && element.classList.contains('carve-footnote-definition'));
                target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                target?.focus?.();
            }, { label: 'Open definition' }),
        });
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
