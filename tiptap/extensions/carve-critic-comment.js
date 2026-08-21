import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Carve editorial-comment mark extension for Tiptap
 *
 * Renders as {# text #} in Carve markup
 *
 * @example
 * ```js
 * import { CarveCriticComment } from '@markup-carve/carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveCriticComment],
 * })
 *
 * // Toggle editorial comment mark
 * editor.chain().focus().toggleCarveCriticComment().run()
 * ```
 */
export const CarveCriticComment = Mark.create({
    name: 'carveCriticComment',

    // Outrank CarveSpan, whose `span[class]` rule accepts any simple class name
    // and therefore claims `<span class="critic-comment">` too. At equal
    // priority the generic span wins and an editorial comment comes back as a
    // plain span carrying a class, losing which syntax the author wrote.
    priority: 101,

    parseHTML() {
        return [
            { tag: 'span.critic-comment' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // The class stays hyphenated while the Carve node type is
        // `critic_comment`. The class is user-visible styling that stylesheets
        // select on, so it does not follow the AST vocabulary.
        return ['span', mergeAttributes(HTMLAttributes, { class: 'critic-comment' }), 0];
    },

    addCommands() {
        return {
            toggleCarveCriticComment: () => ({ commands }) => commands.toggleMark(this.name),
            setCarveCriticComment: () => ({ commands }) => commands.setMark(this.name),
            unsetCarveCriticComment: () => ({ commands }) => commands.unsetMark(this.name),
        };
    },
});

export default CarveCriticComment;
