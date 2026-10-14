import { Node } from '@tiptap/core';

/**
 * The join a table `+` continuation row leaves in a cell. It reads as the
 * space it renders, and its `line` says which continuation line the text after
 * it came from, so the writer can put the row back on its lines.
 */
export const CarveCellWrap = Node.create({
    name: 'carveCellWrap',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    addAttributes() {
        return {
            line: {
                default: 1,
                parseHTML: element => Number.parseInt(element.getAttribute('data-carve-cell-wrap'), 10) || 1,
                renderHTML: attributes => ({ 'data-carve-cell-wrap': String(attributes.line || 1) }),
            },
        };
    },
    parseHTML() { return [{ tag: 'span[data-carve-cell-wrap]', priority: 60 }]; },
    renderHTML({ HTMLAttributes }) { return ['span', HTMLAttributes, ' ']; },
    renderText() { return ' '; },
});

export default CarveCellWrap;
