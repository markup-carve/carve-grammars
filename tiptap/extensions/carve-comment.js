import { Node, mergeAttributes } from '@tiptap/core';

/** An editable Carve line or fenced block comment. */
export const CarveComment = Node.create({
    name: 'carveComment',
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    addAttributes() {
        return { block: { default: false }, delimited: { default: false } };
    },
    parseHTML() { return [{ tag: 'pre[data-carve-comment]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['pre', mergeAttributes(HTMLAttributes, { 'data-carve-comment': 'true' }), ['code', 0]];
    },
});

/** A line comment encountered after paragraph text; it consumes the line tail. */
export const CarveCommentInline = Node.create({
    name: 'carveCommentInline',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
        return { content: { default: '' }, delimited: { default: false } };
    },
    parseHTML() { return [{ tag: 'span[data-carve-comment-inline]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-comment-inline': 'true' }), node.attrs.content];
    },
});
