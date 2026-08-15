import { Node, mergeAttributes } from '@tiptap/core';

/** Authored document front matter carried as an opaque block. */
export const CarveFrontmatter = Node.create({
    name: 'carveFrontmatter',
    group: 'block',
    atom: true,
    addAttributes() {
        return { content: { default: '' }, format: { default: 'yaml' } };
    },
    parseHTML() { return [{ tag: 'pre[data-carve-frontmatter]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['pre', mergeAttributes(HTMLAttributes, { 'data-carve-frontmatter': 'true' }), node.attrs.content];
    },
});

export default CarveFrontmatter;
