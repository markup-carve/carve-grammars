/**
 * Convert Carve source or a carve-js AST into a ProseMirror/Tiptap-shaped JSON
 * document that `serializeToCarve` (tiptap/serializer.js) consumes.
 *
 * Coverage is intentionally partial. The serializer models a specific set of
 * nodes/marks; for any carve AST construct the serializer cannot represent
 * (front matter, reference-link definitions, smart typography, etc.) the
 * default mode throws `UnsupportedNodeError`. `unsupported: 'preserve'` instead
 * emits an opaque `carveUnsupported` atom carrying the original Carve source.
 *
 * The mark/node/attr names below are matched exactly against what the
 * serializer reads (carveInsert, carveDelete, carveSpan, carveMath{src,display},
 * carveFootnote{label}, tableHeader vs tableCell, attrs.colspan/rowspan, ...).
 */
import { parse } from '@markup-carve/carve';

export class UnsupportedNodeError extends Error {
    constructor(type, node = null) {
        super(`carve-to-pm: unsupported node type "${type}"`);
        this.name = 'UnsupportedNodeError';
        this.nodeType = type;
        this.node = node;
    }
}

// Inline carve node type -> the Tiptap mark type the serializer recognizes.
//
// THE KEYS ARE AST TYPE NAMES AND MUST MATCH `CANONICAL_INLINE_TYPES` exactly.
// Four of them did not: `super`/`sub` predate the braced-only spelling
// (markup-carve/carve#276) and `critic-insert`/`critic-delete` predate the rename to
// `insert`/`delete`. No engine has emitted those four names in a long time, so
// the marks were registered in `CarveKit`, written by the serializer, and
// unreachable from here - `{^a^}` threw `unsupported node type "superscript"`.
// The names are checked against the engine's own vocabulary in
// tests/parse-test.js, which is the only thing that can catch the next rename.
export const INLINE_MARKS = {
    emphasis: 'italic',
    italic: 'italic',
    strong: 'bold',
    underline: 'underline',
    strike: 'strike',
    highlight: 'highlight',
    superscript: 'superscript',
    subscript: 'subscript',
    insert: 'carveInsert',
    delete: 'carveDelete',
};

/**
 * Parse Carve source and convert it to a ProseMirror doc.
 * @param {string} source
 * @param {{unsupported?: 'throw'|'preserve'}} [options]
 * @returns {object} ProseMirror `doc` node.
 */
export function carveToProseMirror(source, options = {}) {
    return astToProseMirror(parse(source), { ...options, source });
}

/**
 * Convert a document AST node to a ProseMirror doc.
 * @param {object} ast - carve-js `document` node.
 * @param {{unsupported?: 'throw'|'preserve', source?: string}} [options]
 * @returns {object} ProseMirror `doc` node.
 */
export function astToProseMirror(ast, options = {}) {
    const ctx = makeContext(options);
    if (!ast || ast.type !== 'document') {
        unsupported(ast?.type ?? 'undefined', ast, ctx);
    }
    if (ast.frontmatter) {
        if (ctx.unsupported === 'preserve' && ctx.source) {
            return { type: 'doc', content: [{ type: 'carveUnsupported', attrs: { carveSource: ctx.source } }] };
        }
        unsupported('frontmatter', ast, ctx);
    }
    const content = convertBlocks(ast.children || [], ctx);
    // FOOTNOTE DEFINITIONS live on `ast.footnoteDefs`, not in `children`, so a
    // walk of the body alone never sees them. The serializer has always had a
    // `carveFootnoteDefinition` case and `CarveKit` has always registered the
    // node - nothing produced one, so a note's body was dropped by every round
    // trip and the definition vanished from the output (a declared node type
    // with no producer).
    //
    // They are appended after the body: a definition may be written anywhere and
    // renders nothing where it sits, so position is not part of what the round
    // trip has to preserve - the definition existing is.
    for (const [label, blocks] of Object.entries(ast.footnoteDefs ?? {})) {
        content.push({
            type: 'carveFootnoteDefinition',
            attrs: { label },
            content: convertBlocks(blocks || [], ctx),
        });
    }
    return { type: 'doc', content };
}

export const carveToPm = astToProseMirror;

function makeContext(options) {
    const unsupportedMode = options.unsupported ?? 'throw';
    if (!['throw', 'preserve'].includes(unsupportedMode)) {
        throw new TypeError(`carve-to-pm: unsupported option must be "throw" or "preserve", got "${unsupportedMode}"`);
    }
    const source = typeof options.source === 'string' ? options.source : null;
    return {
        unsupported: unsupportedMode,
        source,
        lineOffsets: source ? lineOffsets(source) : [],
    };
}

function lineOffsets(source) {
    const offsets = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '\n') offsets.push(i + 1);
    }
    return offsets;
}

function unsupported(type, node, ctx) {
    if (ctx?.unsupported === 'preserve') {
        const carveSource = sourceFor(node, ctx);
        if (carveSource) return { type: 'carveUnsupported', attrs: { carveSource } };
    }
    throw new UnsupportedNodeError(type, node);
}

function sourceFor(node, ctx) {
    if (!node?.pos || !ctx?.source) return '';
    const { startLine, startColumn, endLine, endColumn, startOffset, endOffset } = node.pos;
    if (Number.isInteger(startLine) && Number.isInteger(startColumn)
        && Number.isInteger(endLine) && Number.isInteger(endColumn)) {
        const start = (ctx.lineOffsets[startLine - 1] ?? 0) + startColumn - 1;
        const end = (ctx.lineOffsets[endLine - 1] ?? 0) + endColumn - 1;
        return ctx.source.slice(start, end);
    }
    if (Number.isInteger(startOffset) && Number.isInteger(endOffset)) {
        return ctx.source.slice(startOffset, endOffset);
    }
    return '';
}

function convertBlocks(nodes, ctx) {
    return nodes.map((node) => convertBlock(node, ctx));
}

function convertBlock(node, ctx) {
    switch (node.type) {
        case 'paragraph':
            try {
                const paragraph = { type: 'paragraph', content: convertInline(node.children || [], ctx) };
                const attrs = convertAttrs(node.attrs);
                if (attrs) paragraph.attrs = attrs;
                return paragraph;
            } catch (e) {
                if (ctx.unsupported === 'preserve' && e instanceof UnsupportedNodeError) {
                    return unsupported(e.nodeType, node, ctx);
                }
                throw e;
            }

        case 'heading': {
            const attrs = { level: node.level || 1 };
            const id = node.attrs?.id;
            if (id) attrs.id = id;
            // A class or any other attribute on a heading is not represented by
            // the Tiptap heading node, so bail rather than silently drop it.
            if (node.attrs && hasNonIdAttrs(node.attrs)) return unsupported('heading-with-attrs', node, ctx);
            return { type: 'heading', attrs, content: convertInline(node.children || [], ctx) };
        }

        case 'list': {
            const checkedItems = (node.items || []).filter((it) => 'checked' in it);
            if (checkedItems.length > 0) {
                // Mixed task/non-task items in one list are not a thing the
                // serializer reconstructs cleanly; require the whole list.
                if (checkedItems.length !== (node.items || []).length) return unsupported('mixed-task-list', node, ctx);
                return {
                    type: 'taskList',
                    content: (node.items || []).map((it) => ({
                        type: 'taskItem',
                        attrs: { checked: !!it.checked, ...(convertAttrs(it.attrs) || {}) },
                        content: convertBlocks(it.children || [], ctx),
                    })),
                };
            }
            const type = node.ordered ? 'orderedList' : 'bulletList';
            const listNode = {
                type,
                content: (node.items || []).map((it) => {
                    const item = { type: 'listItem', content: convertBlocks(it.children || [], ctx) };
                    // A MARKER attribute (`-{.c} item`) sits on the item, not on
                    // the paragraph inside it, and is the only place those
                    // attributes can live.
                    const itemAttrs = convertAttrs(it.attrs);
                    if (itemAttrs) item.attrs = itemAttrs;
                    return item;
                }),
            };
            if (node.ordered) {
                listNode.attrs = { start: node.start || 1 };
                // The MARKER STYLE: `1.` / `1)` / `a.` / `iv.` / the bare `.`.
                // Dropping it rewrote every alpha and roman list as `1.`.
                if (node.olType) listNode.attrs.olType = node.olType;
                if (node.delim) listNode.attrs.delim = node.delim;
                if (node.bareMarker) listNode.attrs.bareMarker = true;
            }
            return listNode;
        }

        case 'blockquote':
        case 'block_quote':
            return { type: 'blockquote', content: convertBlocks(node.children || [], ctx) };

        case 'code-block':
        case 'code_block':
            return {
                type: 'codeBlock',
                attrs: { language: node.lang || '' },
                content: node.content ? [{ type: 'text', text: node.content }] : [],
            };

        case 'thematic-break':
        case 'thematic_break':
            return { type: 'horizontalRule' };

        case 'image':
            // A bare image as a block (figure-less) is serialized as a paragraph
            // by the serializer's block `image` case; mirror that.
            return blockImage(node);

        case 'table':
            return convertTable(node, ctx);

        case 'div':
            return { type: 'carveDiv', attrs: convertDivAttrs(node), content: convertBlocks(node.children || [], ctx) };

        case 'admonition':
            return convertAdmonition(node, ctx);

        case 'definition-list':
        case 'definition_list':
            return convertDefinitionList(node, ctx);

        // Everything below is a real carve construct the serializer/converter
        // does not faithfully represent. Throwing routes the category to SKIP.
        case 'abbreviation-def':
        case 'abbreviation_def':
            return unsupported('abbreviation-def', node, ctx);
        case 'raw-block':
        case 'raw_block':
            return unsupported('raw-block', node, ctx);
        case 'comment':
            return unsupported('comment', node, ctx);
        case 'figure':
            return unsupported('figure', node, ctx);

        default:
            return unsupported(node.type, node, ctx);
    }
}

function blockImage(node) {
    const attrs = { alt: node.alt || '', src: node.src || '' };
    if (node.title) attrs.title = node.title;
    return { type: 'paragraph', content: [{ type: 'image', attrs }] };
}

function convertAdmonition(node, ctx) {
    if (node.kind === 'tabs') {
        return { type: 'carveTabSet', content: convertBlocks(node.children || [], ctx) };
    }
    if (node.kind === 'tab') {
        return {
            type: 'carveTab',
            attrs: {
                label: node.label ?? inlinePlainText(node.title || []),
                selected: !!node.attrs?.keyValues?.selected,
            },
            content: convertBlocks(node.children || [], ctx),
        };
    }
    const attrs = { class: node.kind || '' };
    const title = inlinePlainText(node.title || []);
    if (title !== '') attrs.title = title;
    return { type: 'carveDiv', attrs, content: convertBlocks(node.children || [], ctx) };
}

function convertDefinitionList(node, ctx) {
    const content = [];
    for (const item of node.items || []) {
        for (const term of item.terms || []) {
            content.push({ type: 'definitionTerm', content: convertInline(term, ctx) });
        }
        for (const definition of item.definitions || []) {
            content.push({ type: 'definitionDescription', content: convertBlocks(definition, ctx) });
        }
    }
    return { type: 'definitionList', content };
}

function inlinePlainText(nodes) {
    return (nodes || []).map((node) => {
        if (node.type === 'text') return node.value || '';
        if (node.children) return inlinePlainText(node.children);
        return '';
    }).join('');
}

function convertTable(node, ctx) {
    const rows = (node.rows || []).map((row) => {
        const cells = (row.cells || []).map((cell) => {
            // carve marks spans on the *filler* cell (`<` colspan, `^` rowspan)
            // rather than the spanning cell, so reconstructing ProseMirror
            // colspan/rowspan attrs from this form is lossy. Bail on any span.
            if (cell.span) unsupported('table-span-cell', cell, ctx);
            return {
                type: cell.header ? 'tableHeader' : 'tableCell',
                attrs: {},
                content: [{ type: 'paragraph', content: convertInline(cell.children || [], ctx) }],
            };
        });
        return { type: 'tableRow', content: cells };
    });
    return { type: 'table', content: rows };
}

function convertInline(nodes, ctx) {
    const out = [];
    for (const node of nodes) {
        out.push(...convertInlineNode(node, [], ctx));
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
function convertInlineNode(node, marks, ctx) {
    switch (node.type) {
        case 'text':
            return [{ type: 'text', text: node.value || '', ...(marks.length ? { marks } : {}) }];

        case 'soft-break':
        case 'soft_break':
            // A NEWLINE, not a space. A soft break is a line break the author
            // wrote, and collapsing it to a space joined a two-line paragraph
            // into one - the serialized document no longer reparsed to the
            // same AST (carve-grammars#102).
            //
            // Writing a newline is safe by construction: a line that would OPEN
            // a block interrupts the paragraph at parse time (PART 9 §10 I1),
            // so a soft break is only ever followed by text that opens nothing.
            // (Marks never span a soft break in practice.)
            return [{ type: 'text', text: '\n' }];

        case 'hard-break':
        case 'hard_break':
            return [{ type: 'hardBreak' }];

        case 'code':
            return [{ type: 'text', text: node.value || '', marks: [...marks, { type: 'code' }] }];

        case 'image': {
            const attrs = { alt: node.alt || '', src: node.src || '' };
            if (node.title) attrs.title = node.title;
            // An image written as a REFERENCE keeps its label, exactly as a
            // link does (PART 12 section 3a). carve-grammars#101 fixed this for
            // links and left images behind, so `![moon][m]` came back as
            // `![moon](/moon.png)` - the reference form gone and the definition
            // with it.
            if (typeof node.ref === 'string' && node.ref !== '') attrs.ref = node.ref;
            if (typeof node.rawRef === 'string' && node.rawRef !== '') attrs.rawRef = node.rawRef;
            return [{ type: 'image', attrs }];
        }

        case 'math': {
            const attrs = { src: node.content || '', display: !!node.display };
            const a = node.attrs || {};
            if (a.id) attrs.id = a.id;
            if (a.classes && a.classes.length) attrs.class = a.classes.join(' ');
            if (a.keyValues && Object.keys(a.keyValues).length) attrs.keyValues = { ...a.keyValues };

            return [{ type: 'carveMath', attrs }];
        }

        // All three spellings. carve-js split `footnote` into `footnote_ref`
        // and `inline_footnote` (markup-carve/carve#405); this repo pins a
        // published carve that still emits the old name, so accepting every
        // form keeps either release order safe. An inline footnote has no
        // label of its own, which the fallback already covers.
        case 'footnote':
        case 'footnote_ref':
        case 'inline_footnote':
            return [{ type: 'carveFootnote', attrs: { label: node.id || 'note' } }];

        case 'mention':
            return [{ type: 'carveMention', attrs: { id: node.user || node.id || '' } }];

        case 'tag':
            return [{ type: 'carveTag', attrs: { id: node.name || node.id || '' } }];

        case 'link': {
            const attrs = { href: node.href || '' };
            if (node.title) attrs.title = node.title;
            // A REFERENCE link is not an inline link, and PART 12 section 3a is
            // what says so: the tree stays pre-resolve, carrying `ref` and the
            // bracket text the author wrote. Dropping them here left the
            // serializer with nothing to write but the resolved destination, so
            // a round trip rewrote `[click][a]` as `[click](…)` - the exact
            // distinction 3a exists to keep (carve-grammars#101).
            if (typeof node.ref === 'string' && node.ref !== '') attrs.ref = node.ref;
            if (typeof node.rawRef === 'string' && node.rawRef !== '') attrs.rawRef = node.rawRef;
            Object.assign(attrs, convertAttrs(node.attrs) || {});
            return descend(node, [...marks, { type: 'link', attrs }], ctx);
        }

        case 'autolink': {
            // `<https://e.com>` carries its own text and no children. The map
            // has always declared autolink -> the link mark; the converter had
            // no case for it, so every autolink threw.
            const text = node.text ?? node.href ?? '';
            // An autolink takes an attribute run of its own
            // (`<https://e.com>{#id .c}` renders the id and class on the `<a>`).
            const attrs = { href: node.href || text, autolink: true, ...(convertAttrs(node.attrs) || {}) };
            return [{ type: 'text', text, marks: [...marks, { type: 'link', attrs }] }];
        }

        case 'span':
            return convertSpan(node, marks, ctx);

        case 'critic-comment':
        case 'critic_comment':
            return [{ type: 'text', text: node.text || '', marks: [...marks, { type: 'carveCriticComment' }] }];

        default: {
            const markType = INLINE_MARKS[node.type];
            if (markType) {
                return descend(node, [...marks, { type: markType }], ctx);
            }
            throw new UnsupportedNodeError(node.type, node);
        }
    }
}

function descend(node, marks, ctx) {
    const out = [];
    for (const child of node.children || []) {
        out.push(...convertInlineNode(child, marks, ctx));
    }
    return out;
}

function convertSpan(node, marks, ctx) {
    const a = node.attrs || {};
    // Abbreviation: `[text]{abbr="..."}` parses to a span with keyValues.abbr.
    if (a.keyValues && Object.prototype.hasOwnProperty.call(a.keyValues, 'abbr')) {
        // Only a lone abbr attribute round-trips through carveAbbreviation; any
        // companion id/class/other key would be dropped.
        const extraKeys = Object.keys(a.keyValues).filter((k) => k !== 'abbr');
        if (extraKeys.length || a.id || (a.classes && a.classes.length)) throw new UnsupportedNodeError('span-abbr-plus-attrs', node);
        return descend(node, [...marks, { type: 'carveAbbreviation', attrs: { title: a.keyValues.abbr } }], ctx);
    }
    const attrs = convertAttrs(a) || {};
    return descend(node, [...marks, { type: 'carveSpan', attrs }], ctx);
}

function convertAttrs(attrs) {
    if (!attrs) return null;
    const out = {};
    if (attrs.id) out.id = attrs.id;
    if (attrs.classes && attrs.classes.length) out.class = attrs.classes.join(' ');
    if (attrs.keyValues && Object.keys(attrs.keyValues).length) out.keyValues = { ...attrs.keyValues };
    return Object.keys(out).length ? out : null;
}

function convertDivAttrs(node) {
    const attrs = convertAttrs(node.attrs) || {};
    if (!attrs.class && node.class) attrs.class = node.class;
    if (!attrs.class) attrs.class = '';
    if (node.title) attrs.title = inlinePlainText(node.title);
    return attrs;
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
