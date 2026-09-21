import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';
import { createInlineFieldsView } from './editable-atom-view.js';

/**
 * Carve Math node extension for Tiptap.
 *
 * Inline atom holding raw math source. Serializes to Carve as:
 * - inline:  `` $`x`$ ``
 * - display: `` $$`x`$$ `` (when `display` is true)
 *
 * The source is stored verbatim in `data-carve-math`; rendering of the math
 * itself (KaTeX/MathML/etc.) is left to the host application's node view.
 *
 * @example
 * ```js
 * import { CarveMath } from '@markup-carve/carve-grammars/tiptap'
 *
 * editor.chain().focus().insertCarveMath({ src: 'E = mc^2' }).run()
 * ```
 */
export const CarveMath = Node.create({
    name: 'carveMath',

    group: 'inline',

    inline: true,

    atom: true,

    addAttributes() {
        return {
            src: {
                default: '',
                parseHTML: element => {
                    const explicit = element.getAttribute('data-carve-math');
                    if (explicit) return explicit;
                    // carve-php renders <span class="math ...">\(TEX\)</span> or
                    // \[TEX\] for display; recover the raw TeX by stripping the
                    // \( \) / \[ \] delimiters.
                    return (element.textContent || '')
                        .trim()
                        .replace(/^\\[([]/, '')
                        .replace(/\\[)\]]$/, '')
                        .trim();
                },
                renderHTML: attributes => ({ 'data-carve-math': attributes.src }),
            },
            display: {
                default: false,
                parseHTML: element => element.getAttribute('data-display') === 'true' || element.classList.contains('display'),
                renderHTML: attributes => (attributes.display ? { 'data-display': 'true' } : {}),
            },
            // Carve attributes on the span: `$`a^2`{.boxed #eq1}`. Without a
            // place to keep them the serializer had nothing to write back, so
            // they were dropped silently on the way out.
            ...attributeSlots(['data-carve-math', 'data-display']),
            class: {
                default: null,
                parseHTML: element => {
                    // carve-php renders `<span class="math inline">` /
                    // `class="math display"`, and this node's own renderHTML
                    // adds `carve-math`. None of the four is an authored class -
                    // keeping them would re-emit `{.math .inline}` on a
                    // carve-php round trip and `{.carve-math}` after a
                    // getHTML()/setContent() cycle through the editor itself.
                    const own = new Set(['math', 'inline', 'display', 'carve-math']);
                    const classes = (element.getAttribute('class') || '')
                        .split(/\s+/)
                        .filter(c => c && !own.has(c));

                    return classes.length ? classes.join(' ') : null;
                },
                renderHTML: attributes => (attributes.class ? { class: attributes.class } : {}),
            },
        };
    },

    parseHTML() {
        return [
            // Above the default 50: CarveSpan claims any span whose class is a
            // single simple word, which `carve-math` is - so the editor's own
            // rendered math would be re-read as a generic attributed span. A
            // span that declares itself math outranks that.
            { tag: 'span[data-carve-math]', priority: 60 },
            // carve-php rendered output (`class="math inline"` - two words, so
            // CarveSpan's pattern never matched it).
            { tag: 'span.math' },
        ];
    },

    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, {
            class: 'carve-math',
            'data-carve-math': node.attrs.src,
        }), node.attrs.src];
    },

    addNodeView() {
        return createInlineFieldsView({
            className: 'carve-math-editor', label: 'Math expression',
            display: node => `${node.attrs.display ? '∑' : 'ƒ'} ${node.attrs.src || 'empty math'}`,
            fields: [
                { name: 'src', label: 'TeX source', multiline: true },
                { name: 'display', label: 'Display math', type: 'checkbox' },
            ],
        });
    },

    addCommands() {
        return {
            insertCarveMath: attributes => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: attributes,
                });
            },
        };
    },
});

export default CarveMath;
