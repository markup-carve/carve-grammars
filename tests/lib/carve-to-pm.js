/**
 * Convert a carve-js AST (from `parse()`) into a ProseMirror/Tiptap-shaped JSON
 * document that `serializeToCarve` (tiptap/serializer.js) consumes.
 *
 * This converter exists purely to drive the serializer round-trip test: it
 * rebuilds the ProseMirror model the serializer would have produced from the
 * Tiptap editor, so we can feed real corpus documents through
 * parse -> toPm -> serialize -> parse and assert idempotence.
 *
 * Coverage is intentionally partial. The serializer models a specific set of
 * nodes/marks; for any carve AST construct the serializer cannot represent
 * (admonitions, generic divs without a class round-trip, definition lists,
 * front matter, reference-link definitions, smart typography, etc.) we THROW an
 * `UnsupportedNodeError`. The round-trip test catches that and routes the whole
 * category to the SKIP list, keeping the covered set honest: a category is only
 * "covered" if every one of its files converts cleanly AND round-trips.
 *
 * The mark/node/attr names below are matched exactly against what the
 * serializer reads (carveInsert, carveDelete, carveSpan, carveMath{src,display},
 * carveFootnote{label}, tableHeader vs tableCell, attrs.colspan/rowspan, ...).
 */

export class UnsupportedNodeError extends Error {
    constructor(type) {
        super(`carve-to-pm: unsupported node type "${type}"`);
        this.name = 'UnsupportedNodeError';
        this.nodeType = type;
    }
}

const unsupported = (type) => { throw new UnsupportedNodeError(type); };

// Inline carve node type -> the Tiptap mark type the serializer recognizes.
const INLINE_MARKS = {
    italic: 'italic',
    strong: 'bold',
    underline: 'underline',
    strike: 'strike',
    highlight: 'highlight',
    super: 'superscript',
    sub: 'subscript',
    'critic-insert': 'carveInsert',
    'critic-delete': 'carveDelete',
};

/**
 * Convert a document AST node to a ProseMirror doc.
 * @param {object} ast - carve-js `document` node.
 * @returns {object} ProseMirror `doc` node.
 */
export function carveToPm(ast) {
    if (!ast || ast.type !== 'document') {
        unsupported(ast?.type ?? 'undefined');
    }
    return {
        type: 'doc',
        content: convertBlocks(ast.children || []),
    };
}

function convertBlocks(nodes) {
    return nodes.map(convertBlock);
}

function convertBlock(node) {
    switch (node.type) {
        case 'paragraph':
            return { type: 'paragraph', content: convertInline(node.children || []) };

        case 'heading': {
            const attrs = { level: node.level || 1 };
            const id = node.attrs?.id;
            if (id) attrs.id = id;
            // A class or any other attribute on a heading is not represented by
            // the Tiptap heading node, so bail rather than silently drop it.
            if (node.attrs && hasNonIdAttrs(node.attrs)) unsupported('heading-with-attrs');
            return { type: 'heading', attrs, content: convertInline(node.children || []) };
        }

        case 'list': {
            const checkedItems = (node.items || []).filter((it) => 'checked' in it);
            if (checkedItems.length > 0) {
                // Mixed task/non-task items in one list are not a thing the
                // serializer reconstructs cleanly; require the whole list.
                if (checkedItems.length !== (node.items || []).length) unsupported('mixed-task-list');
                return {
                    type: 'taskList',
                    content: (node.items || []).map((it) => ({
                        type: 'taskItem',
                        attrs: { checked: !!it.checked },
                        content: convertBlocks(it.children || []),
                    })),
                };
            }
            const type = node.ordered ? 'orderedList' : 'bulletList';
            const listNode = {
                type,
                content: (node.items || []).map((it) => ({
                    type: 'listItem',
                    content: convertBlocks(it.children || []),
                })),
            };
            if (node.ordered) listNode.attrs = { start: node.start || 1 };
            return listNode;
        }

        case 'blockquote':
            return { type: 'blockquote', content: convertBlocks(node.children || []) };

        case 'code-block':
            return {
                type: 'codeBlock',
                attrs: { language: node.lang || '' },
                content: node.content ? [{ type: 'text', text: node.content }] : [],
            };

        case 'thematic-break':
            return { type: 'horizontalRule' };

        case 'image':
            // A bare image as a block (figure-less) is serialized as a paragraph
            // by the serializer's block `image` case; mirror that.
            return blockImage(node);

        case 'table':
            return convertTable(node);

        case 'div':
            // A plain `:::` div with no class round-trips; one carrying a class
            // does not (carve does not reparse `::: {.x}` as a div), so only the
            // class-less form is supported.
            if (node.attrs && hasAnyAttrs(node.attrs)) unsupported('div-with-attrs');
            return { type: 'carveDiv', attrs: { class: '' }, content: convertBlocks(node.children || []) };

        // Everything below is a real carve construct the serializer/converter
        // does not faithfully represent. Throwing routes the category to SKIP.
        case 'admonition':
            return unsupported('admonition');
        case 'definition-list':
            return unsupported('definition-list');
        case 'abbreviation-def':
            return unsupported('abbreviation-def');
        case 'raw-block':
            return unsupported('raw-block');
        case 'comment':
            return unsupported('comment');
        case 'figure':
            return unsupported('figure');

        default:
            return unsupported(node.type);
    }
}

function blockImage(node) {
    const attrs = { alt: node.alt || '', src: node.src || '' };
    if (node.title) attrs.title = node.title;
    return { type: 'paragraph', content: [{ type: 'image', attrs }] };
}

function convertTable(node) {
    const rows = (node.rows || []).map((row) => {
        const cells = (row.cells || []).map((cell) => {
            // carve marks spans on the *filler* cell (`<` colspan, `^` rowspan)
            // rather than the spanning cell, so reconstructing ProseMirror
            // colspan/rowspan attrs from this form is lossy. Bail on any span.
            if (cell.span) unsupported('table-span-cell');
            return {
                type: cell.header ? 'tableHeader' : 'tableCell',
                attrs: {},
                content: [{ type: 'paragraph', content: convertInline(cell.children || []) }],
            };
        });
        return { type: 'tableRow', content: cells };
    });
    return { type: 'table', content: rows };
}

function convertInline(nodes) {
    const out = [];
    for (const node of nodes) {
        out.push(...convertInlineNode(node, []));
    }
    return out;
}

/**
 * Convert one inline node into ProseMirror inline nodes, carrying the set of
 * accumulated marks down to the leaf text nodes.
 * @param {object} node
 * @param {{type: string, attrs?: object}[]} marks
 * @returns {object[]}
 */
function convertInlineNode(node, marks) {
    switch (node.type) {
        case 'text':
            return [{ type: 'text', text: node.value || '', ...(marks.length ? { marks } : {}) }];

        case 'soft-break':
            // The serializer has no soft-break node; carve treats a soft break as
            // whitespace between inline runs, so emit a space text node. (Marks
            // never span a soft break in practice.)
            return [{ type: 'text', text: ' ' }];

        case 'hard-break':
            return [{ type: 'hardBreak' }];

        case 'code':
            return [{ type: 'text', text: node.value || '', marks: [...marks, { type: 'code' }] }];

        case 'image': {
            const attrs = { alt: node.alt || '', src: node.src || '' };
            if (node.title) attrs.title = node.title;
            return [{ type: 'image', attrs }];
        }

        case 'math':
            return [{ type: 'carveMath', attrs: { src: node.content || '', display: !!node.display } }];

        // All three spellings. carve-js split `footnote` into `footnote_ref`
        // and `inline_footnote` (markup-carve/carve#405); this repo pins a
        // published carve that still emits the old name, so accepting every
        // form keeps either release order safe. An inline footnote has no
        // label of its own, which the fallback already covers.
        case 'footnote':
        case 'footnote_ref':
        case 'inline_footnote':
            return [{ type: 'carveFootnote', attrs: { label: node.id || 'note' } }];

        case 'link': {
            const attrs = { href: node.href || '' };
            if (node.title) attrs.title = node.title;
            return descend(node, [...marks, { type: 'link', attrs }]);
        }

        case 'span':
            return convertSpan(node, marks);

        default: {
            const markType = INLINE_MARKS[node.type];
            if (markType) {
                return descend(node, [...marks, { type: markType }]);
            }
            return unsupported(node.type);
        }
    }
}

function descend(node, marks) {
    const out = [];
    for (const child of node.children || []) {
        out.push(...convertInlineNode(child, marks));
    }
    return out;
}

function convertSpan(node, marks) {
    const a = node.attrs || {};
    // Abbreviation: `[text]{abbr="..."}` parses to a span with keyValues.abbr.
    if (a.keyValues && Object.prototype.hasOwnProperty.call(a.keyValues, 'abbr')) {
        // Only a lone abbr attribute round-trips through carveAbbreviation; any
        // companion id/class/other key would be dropped.
        const extraKeys = Object.keys(a.keyValues).filter((k) => k !== 'abbr');
        if (extraKeys.length || a.id || (a.classes && a.classes.length)) unsupported('span-abbr-plus-attrs');
        return descend(node, [...marks, { type: 'carveAbbreviation', attrs: { title: a.keyValues.abbr } }]);
    }
    // Plain id/class span -> carveSpan. Other key/value attributes on a span are
    // not represented by carveSpan's serializer path, so bail on them.
    if (a.keyValues && Object.keys(a.keyValues).length) unsupported('span-keyvalue');
    const attrs = {};
    if (a.id) attrs.id = a.id;
    if (a.classes && a.classes.length) attrs.class = a.classes.join(' ');
    return descend(node, [...marks, { type: 'carveSpan', attrs }]);
}

function hasNonIdAttrs(attrs) {
    const { id, order, ...rest } = attrs;
    if (rest.classes && rest.classes.length) return true;
    if (rest.keyValues && Object.keys(rest.keyValues).length) return true;
    delete rest.classes;
    delete rest.keyValues;
    return Object.keys(rest).length > 0;
}

function hasAnyAttrs(attrs) {
    const { order, ...rest } = attrs;
    if (rest.classes && rest.classes.length) return true;
    if (rest.keyValues && Object.keys(rest.keyValues).length) return true;
    if (rest.id) return true;
    delete rest.classes;
    delete rest.keyValues;
    delete rest.id;
    return Object.keys(rest).length > 0;
}
