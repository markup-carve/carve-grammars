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
                parseHTML: element => element.getAttribute('data-footnote-label')
                    // carve-php / carve-js reference: id="fnN".
                    || element.id.replace(/^fn/, '')
                    || 'note',
                renderHTML: attributes => ({ 'data-footnote-label': attributes.label }),
            },
        };
    },

    parseHTML() {
        return [
            // These are also list items, so they must beat StarterKit's
            // ListItem rule instead of tying it at the default priority.
            { tag: 'li[data-footnote-label]', priority: 60 },
            { tag: 'section.carve-footnotes > ol > li', priority: 60 },
            // carve-php / carve-js render the footnote section as
            // <section role="doc-endnotes"><hr><ol><li id="fnN"><p>body
            // <a role="doc-backlink">↩</a></p></li></ol></section>. Take each li
            // as a definition; unwrap the <ol>, drop the <hr> and the back-link
            // so only the body survives.
            { tag: 'section[role="doc-endnotes"] li', priority: 60 },
            { tag: 'section[role="doc-endnotes"] ol', skip: true, priority: 60 },
            { tag: 'section[role="doc-endnotes"] hr', ignore: true, priority: 60 },
            { tag: 'a[role="doc-backlink"]', ignore: true, priority: 60 },
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
