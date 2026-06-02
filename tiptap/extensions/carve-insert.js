import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Carve Insert mark extension for Tiptap
 *
 * Renders as {+text+} in Carve markup
 *
 * @example
 * ```js
 * import { CarveInsert } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveInsert],
 * })
 *
 * // Toggle insert mark
 * editor.chain().focus().toggleCarveInsert().run()
 * ```
 */
export const CarveInsert = Mark.create({
    name: 'carveInsert',

    parseHTML() {
        return [
            { tag: 'ins' },
            { tag: 'span.carve-insert' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'carve-insert' }), 0];
    },

    addCommands() {
        return {
            toggleCarveInsert: () => ({ commands }) => commands.toggleMark(this.name),
            setCarveInsert: () => ({ commands }) => commands.setMark(this.name),
            unsetCarveInsert: () => ({ commands }) => commands.unsetMark(this.name),
        };
    },

    addKeyboardShortcuts() {
        return {
            'Mod-Shift-i': () => this.editor.commands.toggleCarveInsert(),
        };
    },
});

export default CarveInsert;
