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
    // Above the default 50, or CodeBlock's generic `pre` rule claims it first.
    parseHTML() { return [{ tag: 'pre[data-carve-comment]', priority: 60 }]; },
    renderHTML({ HTMLAttributes }) {
        return ['pre', mergeAttributes(HTMLAttributes, { 'data-carve-comment': 'true' }), ['code', 0]];
    },
});

/** A line comment encountered after paragraph text; it consumes the line tail. */
export const CarveCommentInline = Node.create({
    name: 'carveCommentInline',
    group: 'inline',
    inline: true,
    content: 'text*',
    marks: '',
    addAttributes() {
        // `content` remains readable for older stored JSON documents. New
        // documents keep comment text in child text nodes so the caret can edit
        // it directly like any other inline content.
        return { content: { default: null }, delimited: { default: false } };
    },
    parseHTML() { return [{ tag: 'span[data-carve-comment-inline]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-carve-comment-inline': 'true' }), 0];
    },
});
