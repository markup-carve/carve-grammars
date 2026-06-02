import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Carve Abbreviation extension for Tiptap
 *
 * Renders inline abbreviations with the `<abbr>` tag.
 * Serializes to Carve as: [ABBR]{abbr="Full Text"}
 *
 * @example
 * ```js
 * // In editor
 * <abbr title="HyperText Markup Language">HTML</abbr>
 *
 * // Carve output
 * [HTML]{abbr="HyperText Markup Language"}
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
