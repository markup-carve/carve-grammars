import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Carve Delete mark extension for Tiptap
 *
 * Renders as {-text-} in Carve markup
 *
 * @example
 * ```js
 * import { CarveDelete } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveDelete],
 * })
 *
 * // Toggle delete mark
 * editor.chain().focus().toggleCarveDelete().run()
 * ```
 */
export const CarveDelete = Mark.create({
    name: 'carveDelete',

    parseHTML() {
        return [
            { tag: 'del' },
            { tag: 'span.carve-delete' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'carve-delete' }), 0];
    },

    addCommands() {
        return {
            toggleCarveDelete: () => ({ commands }) => commands.toggleMark(this.name),
            setCarveDelete: () => ({ commands }) => commands.setMark(this.name),
            unsetCarveDelete: () => ({ commands }) => commands.unsetMark(this.name),
        };
    },

    addKeyboardShortcuts() {
        return {
            'Mod-Shift-d': () => this.editor.commands.toggleCarveDelete(),
        };
    },
});

export default CarveDelete;
