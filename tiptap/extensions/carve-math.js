import { Node, mergeAttributes } from '@tiptap/core';

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
 * import { CarveMath } from 'carve-grammars/tiptap'
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
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-carve-math]' },
            // carve-php rendered output.
            { tag: 'span.math' },
        ];
    },

    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, {
            class: 'carve-math',
            'data-carve-math': node.attrs.src,
        }), node.attrs.src];
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
