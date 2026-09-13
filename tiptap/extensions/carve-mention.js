import { Node, mergeAttributes } from '@tiptap/core';
import { createInlineFieldsView } from './editable-atom-view.js';

/**
 * Carve mention / tag inline nodes.
 *
 * carve-php / carve-js render `@name` as
 * `<span class="mention"><strong>@name</strong></span>` and `#tag` as
 * `<span class="tag"><strong>#tag</strong></span>`. Citations use a mention:
 * `[@key]` is literal brackets around a mention. These are inline atoms so they
 * round-trip verbatim (the bare `@`/`#` is escaped in ordinary prose, so only a
 * real mention/tag node emits an unescaped one).
 */
function mentionNode(name, cssClass, sigil) {
    return Node.create({
        name,
        group: 'inline',
        inline: true,
        atom: true,

        addAttributes() {
            return {
                id: {
                    default: '',
                    parseHTML: element => (element.textContent || '').replace(/^[@#]/, '').trim(),
                    renderHTML: attributes => ({ 'data-id': attributes.id }),
                },
            };
        },

        parseHTML() {
            // Beat CarveSpan (which also matches span[class]).
            return [{ tag: `span.${cssClass}`, priority: 60 }];
        },

        renderHTML({ HTMLAttributes, node }) {
            return ['span', mergeAttributes(HTMLAttributes, { class: cssClass }), sigil + node.attrs.id];
        },
        addNodeView() {
            return createInlineFieldsView({
                className: `carve-${cssClass}-editor`,
                label: cssClass === 'mention' ? 'Mention' : 'Tag',
                display: node => sigil + (node.attrs.id || ''),
                fields: [{ name: 'id', label: cssClass === 'mention' ? 'Account' : 'Tag' }],
            });
        },
    });
}

export const CarveMention = mentionNode('carveMention', 'mention', '@');
export const CarveTag = mentionNode('carveTag', 'tag', '#');

export default CarveMention;
