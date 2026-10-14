import { Node } from '@tiptap/core';

/**
 * The join a table `+` continuation row leaves in a cell. It reads as the
 * space it renders. `line` says which continuation line the text after it came
 * from, and `row` and `col` which row and column of a spanning cell, so the
 * writer can put the row back on its lines.
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
            row: {
                default: null,
                parseHTML: element => Number.parseInt(element.getAttribute('data-carve-cell-wrap-row'), 10) || null,
                renderHTML: attributes => (attributes.row ? { 'data-carve-cell-wrap-row': String(attributes.row) } : {}),
            },
            col: {
                default: null,
                parseHTML: element => Number.parseInt(element.getAttribute('data-carve-cell-wrap-col'), 10) || null,
                renderHTML: attributes => (attributes.col ? { 'data-carve-cell-wrap-col': String(attributes.col) } : {}),
            },
        };
    },
    parseHTML() { return [{ tag: 'span[data-carve-cell-wrap]', priority: 60 }]; },
    renderHTML({ HTMLAttributes }) { return ['span', HTMLAttributes, ' ']; },
    renderText() { return ' '; },
});

export default CarveCellWrap;
