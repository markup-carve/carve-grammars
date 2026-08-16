/**
 * Convert Carve source or a carve-js AST into a ProseMirror/Tiptap-shaped JSON
 * document that `serializeToCarve` (tiptap/serializer.js) consumes.
 *
 * Coverage is intentionally partial. The serializer models a specific set of
 * nodes/marks; for any carve AST construct the serializer cannot represent
 * (front matter, reference-link definitions, smart typography, etc.) the
 * default mode throws `UnsupportedNodeError`. `unsupported: 'preserve'` instead
 * verifies the rich conversion and uses opaque `carveUnsupported` source when
 * an unsupported subtree or lossy serialization would otherwise alter the AST.
 *
 * The mark/node/attr names below are matched exactly against what the
 * serializer reads (carveInsert, carveDelete, carveSpan, carveMath{src,display},
 * carveFootnote{label}, tableHeader vs tableCell, attrs.colspan/rowspan, ...).
 */
import { parse, toAstJson, toSourceLayout } from '@markup-carve/carve';
import { serializeToCarve } from './serializer.js';

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
/**
 * Load Carve and say what the editor model could not hold.
 *
 * The same conversion `carveToProseMirror` performs, with the report the
 * bridges contract asks for: an application storing documents can refuse to
 * save one that lost something instead of finding out later that it did.
 *
 * @param {string} source - Carve source.
 * @param {object} [options] - As `carveToProseMirror`.
 * @returns {{doc: object, preserved: object<string, string>, degraded: object<string, string>}}
 *   `preserved` names each Carve type kept as exact source rather than as an
 *   editable node; `degraded` names each type whose text survives while the node
 *   does not.
 */
export function carveToProseMirrorWithReport(source, options = {}) {
    const report = {};
    const doc = carveToProseMirror(source, { ...options, report });

    return { doc, preserved: report.preserved || {}, degraded: report.degraded || {} };
}

export function carveToProseMirror(source, options = {}) {
    // Extension-gated constructs (citations, among others) only appear in the
    // AST when the engine is told about them, and the loader parsed with no
    // options at all - so no caller could ever load a document holding one, and
    // the mapping for it could not be exercised.
    const ast = parse(source, options.parse);
    const sourceLayout = toSourceLayout(source, toAstJson(ast));
    const reporting = options.report && typeof options.report === 'object' ? { report: options.report } : null;
    let doc;
    try {
        doc = astToProseMirror(ast, { ...options, source });
    } catch (error) {
        if ((options.unsupported ?? 'throw') === 'preserve' && error instanceof UnsupportedNodeError) {
            return opaqueDocument(source, reporting);
        }
        throw error;
    }

    // `preserve` is a losslessness contract, not merely an instruction to
    // avoid throwing. A construct can have a rich mapping and still be unsafe
    // to write back because its source-sensitive shape is normalized (list
    // columns, invalid marker lookalikes, table fillers, and so on). Verify the
    // proposed rich document once; if it changes the parsed document, retain
    // the complete source as a single opaque atom. Consumers still get rich,
    // editable nodes whenever they are safe, and every other document remains
    // load/save lossless instead of being subtly corrupted.
    if ((options.unsupported ?? 'throw') === 'preserve') {
        if (doc.content?.length === 1 && doc.content[0]?.type === 'carveUnsupported'
            && doc.content[0].attrs?.carveSource !== source) {
            return opaqueDocument(source, reporting);
        }
        try {
            const reparsed = parse(serializeToCarve(doc), options.parse);
            if (stableAst(ast) !== stableAst(reparsed)) return sourceEnvelope(doc, sourceLayout, reporting);
        } catch {
            return sourceEnvelope(doc, sourceLayout, reporting);
        }
    }

    return doc;
}

function opaqueDocument(source, ctx = null) {
    record(ctx, 'preserved', 'document',
        'the whole document is kept as exact source; nothing in it is editable');

    return {
        type: 'doc',
        content: [{ type: 'carveUnsupported', attrs: { carveSource: source, carveType: 'document' } }],
    };
}

function sourceEnvelope(doc, sourceLayout, ctx = null) {
    // The rich projection is kept, but writing it back would not reproduce the
    // document, so the source rides along and the serializer replays it while
    // the document is untouched. The FIRST EDIT invalidates the fingerprint and
    // the projection becomes what is written - which is why this is reported.
    record(ctx, 'preserved', 'document',
        'the rich projection is not write-identical; the source envelope carries the document until it is edited');

    const clean = { ...doc };
    delete clean.attrs;
    return {
        ...clean,
        attrs: {
            carveSource: sourceLayout.source,
            carveFingerprint: pmFingerprint(clean),
            carveSourceLayout: JSON.stringify(sourceLayout),
        },
    };
}

function pmFingerprint(value) {
    if (Array.isArray(value)) return '[' + value.map(pmFingerprint).join(',') + ']';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + pmFingerprint(value[key])).join(',') + '}';
}

function stableAst(value) {
    return JSON.stringify(normalizeAst(value));
}

function normalizeAst(value) {
    if (Array.isArray(value)) return value.map(normalizeAst);
    if (value === null || typeof value !== 'object') return value;
    // `order` is deliberately NOT here. It is the run's authored spelling, and
    // the `preserve` losslessness check is what decides whether the rich
    // projection may be written back: with `order` stripped, a document whose
    // attribute run would be respelled looked write-identical and was written
    // back respelled (markup-carve/carve-grammars#240).
    const volatile = new Set([
        'pos', 'startLine', 'endLine', 'startColumn', 'endColumn',
        'startOffset', 'endOffset', 'line', 'column', 'offset',
        'srcByteLength',
    ]);
    const emptyArrays = new Set(['children', 'items', 'cells', 'rows']);
    const out = {};
    for (const key of Object.keys(value).sort()) {
        if (volatile.has(key)) continue;
        const child = value[key];
        if (emptyArrays.has(key) && Array.isArray(child) && child.length === 0) continue;
        out[key] = normalizeAst(child);
    }
    return out;
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
    const content = [];
    if (ast.frontmatter) {
        // `carveFrontmatter` is an atom carrying the block VERBATIM (PART 12
        // section 7 keeps it unparsed), so the editor holds the same text the
        // author wrote and the serializer rebuilds the fences around it.
        content.push({
            type: 'carveFrontmatter',
            attrs: {
                format: ast.frontmatter.format || 'yaml',
                content: ast.frontmatter.content || '',
            },
        });
    }
    const body = ast.children || [];
    // Retain the semantic tree. If its canonical spelling is lossy, the public
    // loader adds an edit-aware source envelope after the complete AST check.
    content.push(...convertBlocks(body, ctx));
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
        // What the editor model could not hold, filled as it happens. A bridge
        // REPORTS; the caller decides whether a document that lost something
        // may be stored (docs/format-bridges.md). carve-php has exposed
        // droppedTypes()/degradedTypes() since it had a bridge at all; this one
        // reported nothing, so a Tiptap application storing Carve had no way to
        // learn that a construct arrived as an opaque atom.
        report: options.report && typeof options.report === 'object' ? options.report : null,
        lineOffsets: source ? lineOffsets(source) : [],
        // Parser positions are normalized across BOM/CRLF/CR input, so source
        // slicing by line/column is deliberately avoided for those documents.
        // The final whole-document AST check remains authoritative.
        nonCanonicalLineEncoding: Boolean(source && (source.startsWith('\uFEFF') || source.includes('\r'))),
    };
}

function lineOffsets(source) {
    const offsets = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '\n') offsets.push(i + 1);
    }
    return offsets;
}

/**
 * Record what the editor model could not hold.
 * @param {object} ctx
 * @param {'preserved'|'degraded'} bucket
 * @param {string} type - The Carve node type.
 * @param {string} reason
 */
function record(ctx, bucket, type, reason) {
    if (!ctx?.report) return;
    const into = ctx.report[bucket] || (ctx.report[bucket] = {});
    if (!(type in into)) into[type] = reason;
}

function unsupported(type, node, ctx) {
    if (ctx?.unsupported === 'preserve') {
        const carveSource = sourceFor(node, ctx);
        if (carveSource) {
            record(ctx, 'preserved', type, 'kept as exact source in a carveUnsupported atom; not editable');

            // The TYPE the atom stands in for, not only its source. Without it
            // a caller can see that something was preserved and never learn
            // what, which is the same silence the atom exists to avoid.
            return { type: 'carveUnsupported', attrs: { carveSource, carveType: type } };
        }
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

function referenceDefinitionSource(ref, ctx) {
    if (!ctx?.source || typeof ref !== 'string' || ref === '') return '';
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = ctx.source.match(new RegExp(`^\\[${escaped}\\]:[^\\r\\n]*$`, 'm'));
    const line = match?.[0] || '';
    return /\{[^\r\n]*\}\s*$/.test(line) ? line : '';
}

function authoredReferenceAttrs(rawRef) {
    if (typeof rawRef !== 'string' || rawRef === '') return null;
    try {
        const link = parse(rawRef).children?.[0]?.children?.find((child) => child.type === 'link');
        return convertAttrs(link?.attrs);
    } catch {
        return null;
    }
}

function convertBlocks(nodes, ctx, localizeLossy = false) {
    return nodes.map((node) => {
        try {
            const converted = convertBlock(node, ctx);
            // A preceding block-attribute line is deliberately outside the
            // node's source span. Standalone validation would compare a slice
            // without those attributes to a conversion that correctly carries
            // them, so leave attributed blocks for the document-level check.
            // A reference's definition can live outside this block. Validating
            // the block slice alone therefore reparses it as unresolved and
            // falsely declares the rich conversion lossy; the document-level
            // check below has the complete definition context.
            const hasExternalReference = nodeHasExternalReference(node);
            if (localizeLossy && ctx.unsupported === 'preserve' && !ctx.nonCanonicalLineEncoding
                && !node.attrs && !hasExternalReference) {
                const carveSource = sourceFor(node, ctx);
                if (carveSource) {
                    try {
                        const original = parse(carveSource);
                        const written = parse(serializeToCarve({ type: 'doc', content: [converted] }));
                        if (stableAst(original) !== stableAst(written)) {
                            return localizeLossyBlock(node, converted, carveSource, ctx);
                        }
                    } catch {
                        return localizeLossyBlock(node, converted, carveSource, ctx);
                    }
                }
            }
            return converted;
        } catch (error) {
            // An unsupported inline child must not make the complete document
            // opaque. The block position includes its opening markup and all
            // children, so it is the smallest source slice that can safely be
            // kept while sibling blocks remain rich and editable.
            if (ctx.unsupported === 'preserve' && error instanceof UnsupportedNodeError) {
                return unsupported(error.nodeType, node, ctx);
            }
            throw error;
        }
    });
}

function nodeHasExternalReference(node) {
    if (!node || typeof node !== 'object') return false;
    const resolvedTarget = (typeof node.href === 'string' && node.href !== '')
        || (typeof node.src === 'string' && node.src !== '');
    if (typeof node.ref === 'string' && node.ref !== '' && resolvedTarget) {
        return true;
    }
    return Object.values(node).some((value) => Array.isArray(value)
        ? value.some(nodeHasExternalReference)
        : value && typeof value === 'object' && nodeHasExternalReference(value));
}

/**
 * Keep an editable block shell when only its inline representation is lossy.
 * Paragraph and heading positions cover their authored inline source exactly;
 * block attributes remain on the rich node and are serialized separately.
 */
function localizeLossyBlock(node, converted, carveSource, ctx) {
    if (node.type === 'paragraph') {
        return {
            ...converted,
            content: carveSource === '' ? [] : [unsupportedInlineSource(carveSource)],
        };
    }
    if (node.type === 'heading') {
        const inlineSource = sourceForInlineChildren(node.children || [], ctx);
        if (inlineSource !== '') {
            return { ...converted, content: [unsupportedInlineSource(inlineSource)] };
        }
    }
    return { type: 'carveUnsupported', attrs: { carveSource } };
}

function unsupportedInlineSource(carveSource, type = 'inline') {
    return { type: 'carveUnsupportedInline', attrs: { carveSource, carveType: type } };
}

function sourceForInlineChildren(children, ctx) {
    if (!children.length || !ctx?.source) return '';
    const first = children[0]?.pos;
    const last = children[children.length - 1]?.pos;
    if (Number.isInteger(first?.startOffset) && Number.isInteger(last?.endOffset)) {
        return ctx.source.slice(first.startOffset, last.endOffset);
    }
    if (Number.isInteger(first?.startLine) && Number.isInteger(first?.startColumn)
        && Number.isInteger(last?.endLine) && Number.isInteger(last?.endColumn)) {
        const start = (ctx.lineOffsets[first.startLine - 1] ?? 0) + first.startColumn - 1;
        const end = (ctx.lineOffsets[last.endLine - 1] ?? 0) + last.endColumn - 1;
        return ctx.source.slice(start, end);
    }
    return '';
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
            const attrs = { level: node.level || 1, ...(convertAttrs(node.attrs) || {}) };
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
                    ...(typeof node.tight === 'boolean' ? { attrs: { carveTight: node.tight } } : {}),
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
            const listAttrs = convertAttrs(node.attrs);
            if (listAttrs) listNode.attrs = listAttrs;
            // LOOSE or TIGHT is content, not styling: a loose list read back as
            // tight loses the paragraph inside each item. The serializer can
            // only DERIVE looseness from an item holding more than one block,
            // which misses the authored `- a\n\n- b` - every such list came
            // back tight.
            if (typeof node.tight === 'boolean') {
                listNode.attrs = { ...(listNode.attrs || {}), carveTight: node.tight };
            }
            if (node.ordered) {
                listNode.attrs = { ...(listNode.attrs || {}), start: node.start || 1 };
                // The MARKER STYLE: `1.` / `1)` / `a.` / `iv.` / the bare `.`.
                // Dropping it rewrote every alpha and roman list as `1.`.
                if (node.olType) listNode.attrs.carveOlType = node.olType;
                if (node.delim) listNode.attrs.carveDelim = node.delim;
                if (node.bareMarker) listNode.attrs.carveBareMarker = true;
            }
            return listNode;
        }

        case 'blockquote':
        case 'block_quote':
            return { type: 'blockquote', content: convertBlocks(node.children || [], ctx) };

        case 'code-block':
        case 'code_block': {
            const attrs = { language: node.lang || '', ...(convertAttrs(node.attrs) || {}) };
            // Fence metadata rides a STOCK codeBlock, so it is carve-prefixed:
            // `header` and `label` are names any other extension may claim.
            if (typeof node.header === 'string') attrs.carveHeader = node.header;
            if (typeof node.label === 'string') attrs.carveLabel = node.label;
            return {
                type: 'codeBlock',
                attrs,
                content: node.content ? [{ type: 'text', text: node.content }] : [],
            };
        }

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
            if ((node.attrs?.classes || []).length === 1 && node.attrs.classes[0] === 'hardbreaks'
                && !node.attrs.id && !Object.keys(node.attrs.keyValues || {}).length) {
                return { type: 'carveLineBlock', attrs: { mode: '\\' }, content: convertBlocks(node.children || [], ctx) };
            }
            return {
                type: 'carveDiv',
                attrs: { ...convertDivAttrs(node), ...(node.label != null ? { label: node.label } : {}) },
                content: convertBlocks(node.children || [], ctx),
            };

        case 'line-block':
        case 'line_block':
            return { type: 'carveLineBlock', attrs: { mode: '|' }, content: convertBlocks(node.children || [], ctx) };

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
            return {
                type: 'carveRawBlock',
                attrs: { format: node.format || '' },
                content: node.content ? [{ type: 'text', text: node.content }] : [],
            };
        case 'comment':
            return {
                type: 'carveComment',
                // `delimited` is the `%%{ ... }%%` form (PART 9 section 21a). The
                // engine pinned here does not emit it yet and carve-php does, so
                // it is written from the start rather than added later - a wire
                // that gains a field is a wire two bridges disagree about until
                // both move.
                attrs: { block: Boolean(node.block), delimited: Boolean(node.delimited) },
                content: node.content ? [{ type: 'text', text: node.content }] : [],
            };
        case 'figure':
            return convertFigure(node, ctx);
        case 'figure-group':
        case 'figure_group':
            return convertFigureGroup(node, ctx);

        case 'link_reference_definition': {
            // Carrying the definition as a NODE is what lets `[text][label]`
            // keep its spelling without the serializer having to reconstruct a
            // definition line from the reference that resolved it. The
            // serializer registers the label as written so the reference
            // collector does not append a second copy at the end.
            const attrs = { label: node.label || '', href: node.href || '' };
            if (node.title != null) attrs.title = node.title;
            const authored = convertAttrs(node.attrs);
            if (authored) Object.assign(attrs, authored);
            return { type: 'carveLinkRefDef', attrs };
        }

        // A rendering wrapper rather than authored source: no Carve spelling
        // opens a section, so `parse()` never emits one. An AST that arrives
        // from elsewhere - another engine's `ast-json`, a patch - can hold one,
        // and its children have to survive.
        case 'section':
            return { type: 'carveSection', content: convertBlocks(node.children || [], ctx) };

        default:
            return unsupported(node.type, node, ctx);
    }
}

function convertFigure(node, ctx) {
    const target = node.target;
    let convertedTarget;
    if (target?.type === 'image') {
        convertedTarget = blockImage(target);
    } else if (target?.type === 'math') {
        convertedTarget = { type: 'paragraph', content: convertInlineNode(target, [], ctx) };
    } else if (target) {
        convertedTarget = convertBlock(target, ctx);
    } else {
        throw new UnsupportedNodeError('figure-target', node);
    }
    const figure = {
        type: 'carveFigure',
        content: [
            convertedTarget,
            { type: 'carveCaption', content: convertInline(node.caption || [], ctx) },
        ],
    };
    const attrs = convertAttrs(node.attrs);
    if (attrs) figure.attrs = attrs;
    return figure;
}

/**
 * A composite figure (PART 9 §4c): one figure of ordered panels.
 *
 * `children` are ordinary blocks in SOURCE ORDER - the panels are the `figure`
 * and `table` nodes among them, and non-panel content sits between them in
 * place. There is no `panels` array to read and none to build: which children
 * are panels is derived by type, the way the renderer derives it, so the two
 * can never disagree.
 *
 * The group is discriminated by its TYPE. It carries no `target`, and this
 * function must never be reached by sniffing for that missing field.
 */
function convertFigureGroup(node, ctx) {
    const content = convertBlocks(node.children || [], ctx);
    // The group caption is written BELOW the closing fence, but it is the
    // group's own caption, so it rides as the last child and the serializer
    // puts it back where it was authored. Absent means uncaptioned: an empty
    // `carveCaption` would write a bare `^ ` line the author never typed.
    if (node.caption) {
        content.push({ type: 'carveCaption', content: convertInline(node.caption, ctx) });
    }
    const group = { type: 'carveFigureGroup' };
    const attrs = convertAttrs(node.attrs);
    if (attrs) group.attrs = attrs;
    if (content.length) group.content = content;
    return group;
}

function blockImage(node) {
    const attrs = { alt: node.alt || '', src: node.src || '' };
    if (node.title) attrs.title = node.title;
    if (typeof node.ref === 'string' && node.ref !== '') attrs.carveRef = node.ref;
    if (typeof node.rawRef === 'string' && node.rawRef !== '') attrs.carveRawRef = node.rawRef;
    Object.assign(attrs, convertAttrs(node.attrs) || {});
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
    // `carveTyped` says the KIND WORD was written on the opener. One
    // ProseMirror node serves two Carve types - `admonition` and `div` - and
    // without the flag a bridge cannot tell `::: sidebar` from
    // `{.sidebar}` above a bare `:::`, so every attributed div came back
    // rewritten as a typed one.
    const authored = convertAttrs(node.attrs) || {};
    const classes = [node.kind || '', authored.class || ''].filter(Boolean).join(' ');
    const attrs = { ...authored, class: classes, carveTyped: true };
    const title = inlinePlainText(node.title || []);
    if (title !== '') attrs.title = title;
    if (node.label != null) attrs.label = node.label;
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
    const table = convertTableCore(node, ctx);
    if (node.caption) {
        return {
            type: 'carveFigure',
            content: [table, { type: 'carveCaption', content: convertInline(node.caption, ctx) }],
            ...(convertAttrs(node.attrs) ? { attrs: convertAttrs(node.attrs) } : {}),
        };
    }
    const attrs = convertAttrs(node.attrs);
    if (attrs) table.attrs = attrs;
    return table;
}

function convertTableCore(node, ctx) {
    let previousGrid = [];
    const rows = (node.rows || []).map((row) => {
        const cells = [];
        const grid = [];
        for (let col = 0; col < (row.cells || []).length; col++) {
            const cell = row.cells[col];
            if (cell.span === 'rowspan') {
                const origin = previousGrid[col];
                if (!origin) {
                    const orphan = orphanSpanCell(cell, '^');
                    cells.push(orphan);
                    grid[col] = orphan;
                    continue;
                }
                origin.attrs.rowspan = (origin.attrs.rowspan || 1) + 1;
                grid[col] = origin;
                continue;
            }
            if (cell.span === 'colspan') {
                const origin = grid[col - 1];
                if (!origin) {
                    const orphan = orphanSpanCell(cell, '<');
                    cells.push(orphan);
                    grid[col] = orphan;
                    continue;
                }
                origin.attrs.colspan = (origin.attrs.colspan || 1) + 1;
                grid[col] = origin;
                continue;
            }
            const attrs = { ...(convertAttrs(cell.attrs) || {}) };
            if (cell.align) attrs.textAlign = cell.align;
            const converted = {
                type: cell.header ? 'tableHeader' : 'tableCell',
                attrs,
                content: [{ type: 'paragraph', content: convertInline(cell.children || [], ctx) }],
            };
            cells.push(converted);
            grid[col] = converted;
        }
        previousGrid = grid;
        const convertedRow = { type: 'tableRow', content: cells };
        const rowAttrs = convertAttrs(row.attrs);
        if (rowAttrs) convertedRow.attrs = rowAttrs;
        return convertedRow;
    });
    return { type: 'table', content: rows };
}

function orphanSpanCell(cell, marker) {
    return {
        type: cell.header ? 'tableHeader' : 'tableCell',
        attrs: { carveSpanMarker: marker },
        content: [{ type: 'paragraph' }],
    };
}

function convertInline(nodes, ctx) {
    const out = [];
    for (const node of nodes) {
        try {
            out.push(...convertInlineNode(node, [], ctx));
        } catch (error) {
            if (ctx.unsupported === 'preserve' && error instanceof UnsupportedNodeError) {
                const carveSource = sourceFor(node, ctx);
                if (carveSource) {
                    record(ctx, 'preserved', error.nodeType || node.type,
                        'kept as exact source in a carveUnsupportedInline atom; not editable');
                    out.push(unsupportedInlineSource(carveSource, error.nodeType || node.type));
                    continue;
                }
            }
            throw error;
        }
    }

    return mergeAdjacentText(out);
}

/**
 * Join neighbouring text nodes that carry the same marks.
 *
 * ProseMirror's own schema does this - two adjacent text nodes with equal marks
 * are one node - so a converter that emits them separately produces a document
 * PM would never build, and a round-trip comparison then reports a difference
 * that is not one.
 *
 * The split is not hypothetical: an escape reparses into `escaped_text` plus
 * `text`, so `\* b` arrived as `*` and ` b` where the unescaped spelling of the
 * same text is a single node (carve-grammars#121 noticed this from the other
 * side, and carve-grammars#145 needs it to measure an escape at all).
 */
function mergeAdjacentText(nodes) {
    const out = [];
    for (const node of nodes) {
        const previous = out[out.length - 1];
        if (
            node.type === 'text' &&
            previous?.type === 'text' &&
            JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
        ) {
            out[out.length - 1] = { ...previous, text: previous.text + node.text };

            continue;
        }
        out.push(node);
    }

    return out;
}

/**
 * One citation item. `prefix`, `locator` and `suffix` are inline arrays in the
 * AST and stay inline arrays here, converted like any other inline content; the
 * scalar fields the engine derives (`locatorLabel`, `locatorValue`) ride along
 * so a consumer that understands them does not have to re-derive them from the
 * locator text.
 * @param {object} item
 * @returns {object}
 */
function convertCitationItem(item, ctx) {
    const out = { key: item.key || '', suppressAuthor: !!item.suppressAuthor };
    for (const field of ['prefix', 'locator', 'suffix']) {
        if (Array.isArray(item[field]) && item[field].length) out[field] = convertInline(item[field], ctx);
    }
    for (const field of ['locatorLabel', 'locatorValue']) {
        if (item[field] != null) out[field] = item[field];
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
        // An ESCAPED character is literal text and nothing else: the backslash
        // is a source-level spelling, not a node the editor should show or a
        // shape it can act on. PART 12 gives it its own type only so a writer
        // can reproduce the spelling, and this converter's output has no place
        // to keep that - which is fine, because the serializer re-derives every
        // escape it needs from the text itself.
        //
        // Left unmapped, the converter THREW on any document holding one, so a
        // round trip through an escape could not even be measured - and the
        // serializer emits escapes (carve-grammars#145).
        case 'escaped_text':
            // Degraded, not dropped: the backslash is a source-level spelling
            // the editor has no place for, and the CHARACTER survives as text.
            // Guarded on the type because `text` falls through to here - without
            // it every document with any text at all reported an escape.
            if (node.type === 'escaped_text') {
                record(ctx, 'degraded', 'escaped_text',
                    'the escape is a source spelling; the character survives as text');
            }

            return node.value
                ? [{ type: 'text', text: node.value, ...(marks.length ? { marks } : {}) }]
                : [];

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
            record(ctx, 'degraded', 'soft_break', 'a soft break is whitespace in the ProseMirror model');

            return [{ type: 'text', text: '\n' }];

        case 'hard-break':
        case 'hard_break':
            return [{ type: 'hardBreak' }];

        case 'code': {
            // An attribute run on inline code (`` `x`{.cls} ``) belongs to the
            // code mark. The stock mark declares no attributes, so the run used
            // to be dropped on the way in with nothing reporting it - the
            // caller was told the document round-tripped
            // (markup-carve/carve-grammars#240).
            const codeAttrs = convertAttrs(node.attrs);
            return node.value
                ? [{
                    type: 'text',
                    text: node.value,
                    marks: [...marks, { type: 'code', ...(codeAttrs ? { attrs: codeAttrs } : {}) }],
                }]
                : [];
        }

        case 'image': {
            const attrs = { alt: node.alt || '', src: node.src || '' };
            if (node.title) attrs.title = node.title;
            // An image written as a REFERENCE keeps its label, exactly as a
            // link does (PART 12 section 3a). carve-grammars#101 fixed this for
            // links and left images behind, so `![moon][m]` came back as
            // `![moon](/moon.png)` - the reference form gone and the definition
            // with it.
            if (typeof node.ref === 'string' && node.ref !== '') attrs.carveRef = node.ref;
            if (typeof node.rawRef === 'string' && node.rawRef !== '') attrs.carveRawRef = node.rawRef;
            return [{ type: 'image', attrs }];
        }

        case 'math': {
            const attrs = { src: node.content || '', display: !!node.display, ...(convertAttrs(node.attrs) || {}) };

            return [{ type: 'carveMath', attrs, ...(marks.length ? { marks } : {}) }];
        }

        // All three spellings. carve-js split `footnote` into `footnote_ref`
        // and `inline_footnote` (markup-carve/carve#405); this repo pins a
        // published carve that still emits the old name, so accepting every
        // form keeps either release order safe. An inline footnote has no
        // label of its own, which the fallback already covers.
        case 'inline_footnote':
            // The note's body is ORDINARY inline content and the editor has a
            // node for it, so it is carried as one - `carveInlineNote` holding
            // converted children. Keeping it as a `carveFootnote` atom stamped
            // with its source made the body uneditable and left `carveInlineNote`
            // registered, mapped and produced by nothing.
            return [{
                type: 'carveInlineNote',
                ...(convertAttrs(node.attrs) ? { attrs: convertAttrs(node.attrs) } : {}),
                ...(marks.length ? { marks } : {}),
                content: convertInline(node.inline || node.children || [], ctx),
            }];
        case 'footnote':
        case 'footnote_ref':
            return [{
                type: 'carveFootnote',
                attrs: { label: node.id || 'note' },
                ...(marks.length ? { marks } : {}),
            }];

        case 'mention':
            return [{
                type: 'carveMention',
                attrs: { id: node.user || node.id || '' },
                ...(marks.length ? { marks } : {}),
            }];

        case 'tag':
            return [{
                type: 'carveTag',
                attrs: { id: node.name || node.id || '' },
                ...(marks.length ? { marks } : {}),
            }];

        case 'link': {
            const attrs = { href: node.href || '' };
            if (node.title) attrs.title = node.title;
            // A REFERENCE link is not an inline link, and PART 12 section 3a is
            // what says so: the tree stays pre-resolve, carrying `ref` and the
            // bracket text the author wrote. Dropping them here left the
            // serializer with nothing to write but the resolved destination, so
            // a round trip rewrote `[click][a]` as `[click](…)` - the exact
            // distinction 3a exists to keep (carve-grammars#101).
            if (typeof node.ref === 'string' && node.ref !== '') attrs.carveRef = node.ref;
            if (typeof node.rawRef === 'string' && node.rawRef !== '') attrs.carveRawRef = node.rawRef;
            const definitionSource = referenceDefinitionSource(node.ref, ctx);
            if (definitionSource) attrs.carveReferenceDefinition = definitionSource;
            // A resolved reference carries the definition's attributes merged
            // into every use. Only attributes present in rawRef were authored
            // on this particular link; the definition line is preserved
            // separately above, including attributes shadowed by the use.
            Object.assign(attrs, definitionSource
                ? (authoredReferenceAttrs(node.rawRef) || {})
                : (convertAttrs(node.attrs) || {}));
            return descend(node, [...marks, { type: 'link', attrs }], ctx);
        }

        case 'autolink': {
            // `<https://e.com>` carries its own text and no children. The map
            // has always declared autolink -> the link mark; the converter had
            // no case for it, so every autolink threw.
            const text = node.text ?? node.href ?? '';
            // An autolink takes an attribute run of its own
            // (`<https://e.com>{#id .c}` renders the id and class on the `<a>`).
            const attrs = { href: node.href || text, carveAutolink: true, ...(convertAttrs(node.attrs) || {}) };
            return [{ type: 'text', text, marks: [...marks, { type: 'link', attrs }] }];
        }

        // Each of these takes an authored attribute run of its own
        // (`:rocket:{.big}`, `:widget[x]{#i k=v}`), so the authored attributes
        // are merged in and the node declares slots for them - without both,
        // the run is dropped on the way in and the serializer cannot write it.
        case 'symbol':
            return [{
                type: 'carveSymbol',
                attrs: { name: node.name || '', ...(convertAttrs(node.attrs) || {}) },
                ...(marks.length ? { marks } : {}),
            }];

        case 'literal_inline':
            return [{
                type: 'carveLiteral',
                attrs: { content: node.content || '', ...(convertAttrs(node.attrs) || {}) },
                ...(marks.length ? { marks } : {}),
            }];

        case 'substitution':
            return [{
                type: 'carveSubstitution',
                attrs: {
                    oldText: node.oldText || '',
                    newText: node.newText || '',
                    ...(convertAttrs(node.attrs) || {}),
                },
                ...(marks.length ? { marks } : {}),
            }];

        case 'raw_inline':
            return [{
                type: 'carveRawInline',
                attrs: {
                    format: node.format || '',
                    content: node.content || '',
                    ...(convertAttrs(node.attrs) || {}),
                },
                ...(marks.length ? { marks } : {}),
            }];

        case 'inline_extension':
            // `:name[content]`. NOT `carveEmbed`: that node is a block atom for
            // a media directive, and an inline extension is inline content with
            // children. Media keeps its own path in through the HTML route.
            return [{
                type: 'carveInlineExtension',
                attrs: { name: node.name || '', ...(convertAttrs(node.attrs) || {}) },
                ...(marks.length ? { marks } : {}),
                content: convertInline(node.content || node.children || [], ctx),
            }];

        case 'heading_ref':
            // `</#target>`. The RESOLVED href is a resolution artifact and is
            // deliberately not carried - the target is what the author wrote.
            return [{
                type: 'carveCrossref',
                attrs: { target: node.target || '', ...(convertAttrs(node.attrs) || {}) },
                ...(marks.length ? { marks } : {}),
            }];

        case 'citation_group':
            return [{
                type: 'carveCitation',
                attrs: {
                    raw: node.raw || '',
                    integral: node.mode === 'integral',
                    items: (node.items || []).map((item) => convertCitationItem(item, ctx)),
                    ...(convertAttrs(node.attrs) || {}),
                },
                ...(marks.length ? { marks } : {}),
            }];

        case 'span':
            return convertSpan(node, marks, ctx);

        case 'critic-comment':
        case 'critic_comment':
            return [{ type: 'text', text: node.text || '', marks: [...marks, { type: 'carveCriticComment' }] }];

        case 'comment':
            return [{
                type: 'carveCommentInline',
                attrs: { content: node.content || '', delimited: Boolean(node.delimited) },
            }];

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
    // A mark needs TEXT to attach to, and these four constructs have none:
    // `[](https://example.com)`, `[]{.a}`, `{++}` and `{--}` all parse to a
    // mark-producing node with no children. Walking those children produced
    // nothing, so the construct disappeared - a lone empty-label link came back
    // as an EMPTY DOCUMENT, in silence (markup-carve/carve-grammars#240). The
    // mark and its attributes ride on an atom instead, which writes back the
    // same construct with the same destination, title and attribute run.
    if ((node.children || []).length === 0 && marks.length) {
        const own = marks[marks.length - 1];

        return [{
            type: 'carveEmptyMark',
            attrs: {
                markType: own.type,
                ...(own.attrs && Object.keys(own.attrs).length ? { markAttrs: { ...own.attrs } } : {}),
            },
            ...(marks.length > 1 ? { marks: marks.slice(0, -1) } : {}),
        }];
    }
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
    if (attrs.keyValues && Object.keys(attrs.keyValues).length) out.carveKeyValues = { ...attrs.keyValues };
    // The ORDER the run was written in. Splitting one authored run across three
    // unordered slots is what loses it, so it travels as its own attribute and
    // the serializer replays it (markup-carve/carve-grammars#240).
    if (Object.keys(out).length && Array.isArray(attrs.order) && attrs.order.length) {
        out.carveAttrOrder = [...attrs.order];
    }
    return Object.keys(out).length ? out : null;
}

function convertDivAttrs(node) {
    const attrs = convertAttrs(node.attrs) || {};
    if (!attrs.class && node.class) attrs.class = node.class;
    if (!attrs.class) attrs.class = '';
    if (node.title) attrs.title = inlinePlainText(node.title);
    // A BARE `:::` - whatever classes it carries came from an attribute run,
    // and writing them back as a kind word would change the document.
    attrs.carveTyped = false;
    return attrs;
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
