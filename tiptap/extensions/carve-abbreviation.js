import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Carve Abbreviation extension for Tiptap
 *
 * Renders inline abbreviations with the `<abbr>` tag in the editor.
 * Serializes to Carve as: :abbr[ABBR]{title="Full Text"}
 *
 * Carve has no inline `<abbr>` token, so the expansion is carried as a real
 * `title` on the `:abbr[…]` extension span (carve-php renders
 * `<span class="ext-abbr" title="…">`). parseHTML matches both a native
 * `<abbr title>` and that round-tripped span, so the mark survives an
 * editor -> Carve -> HTML -> editor cycle.
 *
 * @example
 * ```js
 * // In editor
 * <abbr title="HyperText Markup Language">HTML</abbr>
 *
 * // Carve output
 * :abbr[HTML]{title="HyperText Markup Language"}
 * ```
 */
export const CarveAbbreviation = Mark.create({
    name: 'carveAbbreviation',

    addAttributes() {
        return {
            title: {
                default: null,
                parseHTML: element => element.getAttribute('title'),
                renderHTML: attributes => {
                    if (!attributes.title) return {};
                    return { title: attributes.title };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'abbr[title]',
                priority: 51,
            },
            {
                // carve-php renders `:abbr[…]{title="…"}` as this span; matching
                // it closes the editor -> Carve -> HTML -> editor round-trip.
                tag: 'span.ext-abbr[title]',
                priority: 51,
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['abbr', mergeAttributes(HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setAbbreviation: attributes => ({ commands }) => {
                return commands.setMark(this.name, attributes);
            },
            toggleAbbreviation: attributes => ({ commands }) => {
                return commands.toggleMark(this.name, attributes);
            },
            unsetAbbreviation: () => ({ commands }) => {
                return commands.unsetMark(this.name);
            },
        };
    },

    addKeyboardShortcuts() {
        return {
            // Auto-exit abbreviation mark when pressing space
            'Space': () => {
                if (this.editor.isActive(this.name)) {
                    this.editor.commands.unsetMark(this.name);
                    return false; // Let space be typed normally
                }
                return false;
            },
        };
    },
});

export default CarveAbbreviation;
