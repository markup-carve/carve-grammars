/**
 * The mapping between the Carve 0.2 tree and ProseMirror JSON.
 *
 * Each ProseMirror node and mark keeps the tree fields the editor does not own in its `carve`
 * attribute, so `proseMirrorToTree(treeToProseMirror(tree))` gives the same tree for any
 * document. A node the content model cannot hold becomes an atom that carries the whole node.
 * A link or image destination the URL policy denies is `null` in the editor attribute and kept in `carve`.
 * `$`-prefixed keys of `carve` are the kit's own bookkeeping; no tree field starts with `$`.
 */

import { isUrlAllowed } from './url-policy.js';

const DROPPED = new Set(['type', 'pos', 'segments', 'srcByteLength']);

/** Inline containers that become marks: tree type, mark name, the fields the mark owns. */
const MARK_TYPES = [
    ['strong', 'bold'],
    ['emphasis', 'italic'],
    ['underline', 'underline'],
    ['strike', 'strike'],
    ['highlight', 'highlight'],
    ['subscript', 'subscript'],
    ['superscript', 'superscript'],
    ['insert', 'carveInsert'],
    ['delete', 'carveDelete'],
    ['small_caps', 'carveSmallCaps'],
    ['span', 'carveSpan'],
    ['link', 'link', ['href']],
    ['inline_footnote', 'carveInlineFootnote'],
    ['inline_extension', 'carveInlineExtension'],
];
const MARK_OF_TREE = new Map(MARK_TYPES.map(([tree, mark, owned]) => [tree, { mark, owned: owned ?? [] }]));
const TREE_OF_MARK = new Map(MARK_TYPES.map(([tree, mark, owned]) => [mark, { tree, owned: owned ?? [] }]));

/** Block containers whose children are blocks: tree type, node name, the fields the node owns. */
const CONTAINERS = [
    ['block_quote', 'blockquote'],
    ['div', 'carveDiv'],
    ['admonition', 'carveAdmonition', ['kind']],
    ['directive', 'carveDirective'],
    ['section', 'carveSection'],
    ['figure_group', 'carveFigureGroup'],
    ['block_extension', 'carveBlockExtension'],
    ['footnote', 'carveFootnote'],
    ['definition_description', 'carveDefinitionDescription'],
    ['caption', 'carveCaption'],
];
const CONTAINER_OF_TREE = new Map(CONTAINERS.map(([tree, node, owned]) => [tree, { node, owned: owned ?? [] }]));
const TREE_OF_CONTAINER = new Map(CONTAINERS.map(([tree, node, owned]) => [node, { tree, owned: owned ?? [] }]));

/** Textblocks whose children are inlines. */
const TEXTBLOCKS = [
    ['paragraph', 'paragraph'],
    ['heading', 'heading', ['level']],
    ['definition_term', 'carveDefinitionTerm'],
    ['line', 'carveLine'],
    ['citation_definition', 'carveCitationDefinition'],
];
const TEXTBLOCK_OF_TREE = new Map(TEXTBLOCKS.map(([tree, node, owned]) => [tree, { node, owned: owned ?? [] }]));
const TREE_OF_TEXTBLOCK = new Map(TEXTBLOCKS.map(([tree, node, owned]) => [node, { tree, owned: owned ?? [] }]));

/** Blocks whose `value` is their editable text. */
const CODE_BLOCKS = [
    ['comment', 'carveComment'],
    ['raw_block', 'carveRawBlock'],
    ['frontmatter', 'carveFrontmatter'],
];
const CODE_OF_TREE = new Map(CODE_BLOCKS);
const TREE_OF_CODE = new Map(CODE_BLOCKS.map(([tree, node]) => [node, tree]));

/** Nodes whose title (`Inline[]`) is edited as a leading `carveTitle` child. */
const TITLED = new Set(['div', 'admonition', 'directive']);

/** A copy of `value` without positions, at any depth. */
function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        if (item === undefined || key === 'pos' || key === 'segments' || key === 'srcByteLength') continue;
        out[key] = clean(item);
    }
    return out;
}

/** The fields of `node` other than its type, positions and the names in `omit`. */
function fields(node, omit = []) {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
        if (value === undefined || DROPPED.has(key) || omit.includes(key)) continue;
        out[key] = clean(value);
    }
    return out;
}

/** `carve` as an attribute value: null when it holds nothing. */
function carveAttr(carve) {
    return Object.keys(carve).length > 0 ? carve : null;
}

/** The tree fields of a `carve` attribute, without the kit's own keys. */
function treeFields(carve) {
    const out = {};
    if (carve === null || typeof carve !== 'object') return out;
    for (const [key, value] of Object.entries(carve)) if (!key.startsWith('$')) out[key] = value;
    return out;
}

function carveOf(pm) {
    const carve = pm?.attrs?.carve;
    return carve !== null && typeof carve === 'object' ? carve : {};
}

const PLACEHOLDER = { type: 'paragraph' };

function blockAtom(node) {
    return { type: 'carveBlock', attrs: { carve: clean(node) } };
}

function inlineAtom(node, marks) {
    return withMarks({ type: 'carveInline', attrs: { carve: clean(node) } }, marks);
}

function withMarks(pm, marks) {
    if (marks.length > 0) pm.marks = marks;
    return pm;
}

// ---------------------------------------------------------------------------
// Application nodes and marks
// ---------------------------------------------------------------------------

/** The host's `mapping` option, checked: `nodes` and `marks`, each a Map from ProseMirror name to entry. */
function mappingOf(mapping) {
    const out = { nodes: new Map(), marks: new Map() };
    if (mapping === undefined || mapping === null) return out;
    for (const kind of ['nodes', 'marks']) {
        for (const [name, entry] of Object.entries(mapping[kind] ?? {})) out[kind].set(name, mappingEntry(kind, name, entry));
    }
    return out;
}

function mappingEntry(kind, name, entry) {
    if (entry?.carve !== undefined && typeof entry.carve !== 'boolean') throw new TypeError(`mapping: "carve" of "${name}" must be a boolean`);
    if (typeof entry?.toTree === 'function' || typeof entry?.fromTree === 'function') return entry;
    const allowed = kind === 'marks' ? ['span'] : ['span', 'div'];
    const attributes = entry?.attributes ?? [];
    if (!allowed.includes(entry?.as) || typeof entry.class !== 'string' || entry.class === '' ||
        !Array.isArray(attributes) || !attributes.every((attribute) => typeof attribute === 'string') ||
        (entry.content !== undefined && typeof entry.content !== 'boolean')) {
        throw new TypeError(`mapping: the ${kind === 'marks' ? 'mark' : 'node'} "${name}" needs "as" (${allowed.join(' or ')}), a "class" and string "attributes", or "toTree" and "fromTree"`);
    }
    // A declared node is an atom unless it has `content: true`.
    return { as: entry.as, class: entry.class, attributes, content: entry.content === true, carve: entry.carve === true };
}

/** The Carve attributes of a declared node or mark: its class, and each declared attribute with a value as a key/value pair. */
function mappedAttrs(entry, attrs) {
    const keyValues = [];
    for (const name of entry.attributes) {
        const value = attrs?.[name];
        if (value !== null && value !== undefined) keyValues.push([name, typeof value === 'string' ? value : JSON.stringify(value)]);
    }
    return keyValues.length > 0 ? { classes: [entry.class], keyValues } : { classes: [entry.class] };
}

/** Whether `node` is exactly what a declared entry saves, so loading it as the host type loses nothing. */
function declared(entry, node, type, atom = false) {
    if (entry.as !== type || node.type !== type || Object.keys(fields(node, ['children', 'attrs'])).length > 0) return false;
    if (atom && (node.children ?? []).length > 0) return false;
    const attrs = node.attrs ?? {};
    if (Object.keys(attrs).some((key) => key !== 'classes' && key !== 'keyValues')) return false;
    if (!Array.isArray(attrs.classes) || attrs.classes.length !== 1 || attrs.classes[0] !== entry.class) return false;
    const seen = new Set();
    return (attrs.keyValues ?? []).every(([key, value]) => entry.attributes.includes(key) && typeof value === 'string' && !seen.has(key) && seen.add(key));
}

function declaredAttrs(node) {
    const attrs = Object.fromEntries(node.attrs?.keyValues ?? []);
    return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/** The host node a tree node loads as, or undefined. */
function loadMapped(node, position, state) {
    for (const [name, entry] of state.mapping.nodes) {
        if (entry.as === undefined) {
            const pm = entry.fromTree?.(node, {
                position,
                blocks: (children) => loadBlocks(children ?? [], state),
                inlines: (children) => loadInlines(children ?? [], state),
            });
            if (pm !== null && pm !== undefined) return pm;
            continue;
        }
        if (!declared(entry, node, position === 'block' ? 'div' : 'span', !entry.content)) continue;
        const pm = { type: name };
        const attrs = declaredAttrs(node);
        if (attrs !== undefined) pm.attrs = attrs;
        const children = node.children ?? [];
        if (children.length > 0) pm.content = position === 'block' ? loadBlocks(children, state) : loadInlines(children, state);
        return pm;
    }
    return undefined;
}

/** The host mark an inline container loads as, or undefined. */
function loadMappedMark(node, state) {
    for (const [name, entry] of state.mapping.marks) {
        if (entry.as === undefined) {
            const mark = entry.fromTree?.(node);
            if (mark !== null && mark !== undefined) return mark;
            continue;
        }
        if (!declared(entry, node, 'span')) continue;
        const mark = { type: name };
        const attrs = declaredAttrs(node);
        if (attrs !== undefined) mark.attrs = attrs;
        return mark;
    }
    return undefined;
}

/** The tree node of a host node. */
function saveMapped(pm, entry, position, ctx, ptr) {
    if (entry.as === undefined) {
        if (typeof entry.toTree !== 'function') throw new TypeError(`proseMirrorToTree: the mapping of the ProseMirror node "${pm.type}" has no toTree`);
        return entry.toTree(pm, {
            position,
            blocks: (content) => saveBlocks(content ?? [], ctx, ptr),
            inlines: (content) => saveInlines(content ?? [], ctx, ptr),
        });
    }
    const want = position === 'block' ? 'div' : 'span';
    if (entry.as !== want) {
        throw new TypeError(`proseMirrorToTree: the ProseMirror node "${pm.type}" is mapped to a ${entry.as} and cannot stand as ${position === 'block' ? 'a block' : 'an inline'}`);
    }
    const content = pm.content ?? [];
    if (!entry.content && content.length > 0) {
        throw new TypeError(`proseMirrorToTree: the ProseMirror node "${pm.type}" has content; map it with content: true`);
    }
    return { type: want, attrs: mappedAttrs(entry, pm.attrs), children: position === 'block' ? saveBlocks(content, ctx, ptr) : saveInlines(content, ctx, ptr) };
}

function saveMappedMark(mark, entry) {
    if (entry.as === undefined) {
        if (typeof entry.toTree !== 'function') throw new TypeError(`proseMirrorToTree: the mapping of the ProseMirror mark "${mark.type}" has no toTree`);
        return { ...entry.toTree(mark), children: [] };
    }
    return { type: 'span', attrs: mappedAttrs(entry, mark.attrs), children: [] };
}

// ---------------------------------------------------------------------------
// Tree to ProseMirror
// ---------------------------------------------------------------------------

/**
 * ProseMirror JSON of a Carve 0.2 document tree (the result of carve-js `parse`).
 *
 * @param {object} tree a `document` node
 * @param {{ urlPolicy?: { deny?: readonly string[], allow?: readonly string[] }, mapping?: object }} [options] `mapping`: the host's own nodes and marks
 * @returns {object} a ProseMirror `doc` node as JSON
 */
export function treeToProseMirror(tree, options = {}) {
    if (tree?.type !== 'document') throw new TypeError('treeToProseMirror expects a Carve document tree');
    const state = { id: 0, urlPolicy: options.urlPolicy ?? {}, mapping: mappingOf(options.mapping) };
    const content = loadBlocks(tree.children ?? [], state);
    // Each top-level node knows which block of the loaded tree it is, so the source of that block can be kept.
    if ((tree.children ?? []).length > 0) {
        for (const [index, node] of content.entries()) {
            // A host node keeps its place only when its schema has the `carve` attribute.
            if (!state.mapping.nodes.has(node.type) || state.mapping.nodes.get(node.type).carve === true) node.attrs = { ...node.attrs, carve: { ...node.attrs?.carve, $index: index } };
        }
    }
    return {
        type: 'doc',
        attrs: { carve: carveAttr(fields(tree, ['children'])) },
        content,
    };
}

/** Blocks as ProseMirror nodes; an empty list becomes one empty paragraph, which the way back drops. */
function loadBlocks(children, state) {
    const out = children.map((child) => loadBlock(child, state));
    return out.length > 0 ? out : [{ ...PLACEHOLDER }];
}

function loadBlock(node, state) {
    if (node.caption !== undefined && node.type !== 'caption') {
        const { caption, ...rest } = node;
        const captionNode = loadContainer(caption, state);
        if ((caption.children ?? []).length === 0) captionNode.attrs.carve = { ...captionNode.attrs.carve, $empty: true };
        return { type: 'carveCaptioned', content: [loadBlock(rest, state), captionNode] };
    }
    const mapped = loadMapped(node, 'block', state);
    if (mapped !== undefined) return mapped;
    if (TEXTBLOCK_OF_TREE.has(node.type)) return loadTextblock(node, state);
    if (CONTAINER_OF_TREE.has(node.type)) return loadContainer(node, state);
    if (CODE_OF_TREE.has(node.type)) return loadCodeLike(node, CODE_OF_TREE.get(node.type), 'value');
    switch (node.type) {
        case 'code_block': return loadCodeBlock(node);
        case 'thematic_break': return { type: 'horizontalRule', attrs: { carve: carveAttr(fields(node)) } };
        case 'list': return loadList(node, state);
        case 'definition_list': return loadMixed(node, 'carveDefinitionList', state);
        case 'line_block': return loadMixed(node, 'carveLineBlock', state);
        case 'table': return loadTable(node, state);
        default: return blockAtom(node);
    }
}

function loadTextblock(node, state, extra = {}) {
    const { node: name, owned } = TEXTBLOCK_OF_TREE.get(node.type);
    const carve = { ...fields(node, ['children', ...owned]), ...extra };
    // A loaded empty paragraph is content; only one the editor made is a placeholder.
    if ((node.children ?? []).length === 0 && Object.keys(carve).length === 0) carve.$empty = true;
    const attrs = { carve: carveAttr(carve) };
    for (const key of owned) attrs[key] = node[key];
    const content = loadInlines(node.children ?? [], state);
    const pm = { type: name, attrs };
    if (content.length > 0) pm.content = content;
    return pm;
}

function loadContainer(node, state) {
    const { node: name, owned } = CONTAINER_OF_TREE.get(node.type);
    const titled = TITLED.has(node.type) && Array.isArray(node.title) && node.title.length > 0;
    const attrs = { carve: carveAttr(fields(node, ['children', ...owned, ...(titled ? ['title'] : [])])) };
    for (const key of owned) attrs[key] = node[key];
    const content = loadBlocks(node.children ?? [], state);
    if (titled) {
        const title = loadInlines(node.title, state);
        content.unshift(title.length > 0 ? { type: 'carveTitle', content: title } : { type: 'carveTitle' });
    }
    return { type: name, attrs, content };
}

function loadCodeLike(node, name, field) {
    const value = node[field] ?? '';
    const pm = { type: name, attrs: { carve: carveAttr(fields(node, [field])) } };
    if (value !== '') pm.content = [{ type: 'text', text: value }];
    return pm;
}

function loadCodeBlock(node) {
    const value = node.value ?? '';
    const newline = value.endsWith('\n');
    const text = newline && !value.endsWith('\n\n') ? value.slice(0, -1) : value;
    const carve = fields(node, ['value', 'syntax']);
    if (!newline) carve.$newline = false;
    const pm = { type: 'codeBlock', attrs: { language: node.syntax ?? null, carve: carveAttr(carve) } };
    if (text !== '') pm.content = [{ type: 'text', text }];
    return pm;
}

function taskChecked(task) {
    return task?.mark === 'x' || task?.mark === 'X';
}

function loadList(node, state) {
    const items = node.children ?? [];
    if (items.length === 0) return blockAtom(node);
    const tasks = items.every((item) => item.task !== undefined);
    const type = tasks ? 'taskList' : node.marker?.kind === 'ordered' ? 'orderedList' : 'bulletList';
    const attrs = { carve: carveAttr(fields(node, ['children'])) };
    if (type === 'orderedList') attrs.start = node.marker?.start ?? 1;
    return {
        type,
        attrs,
        content: items.map((item) => {
            const itemFields = fields(item, ['children']);
            if ((item.children ?? []).length === 0) itemFields.$empty = true;
            const itemAttrs = { carve: carveAttr(itemFields) };
            if (tasks) itemAttrs.checked = taskChecked(item.task);
            // Tiptap items start with a paragraph; an empty one, which the way back drops, leads any other block.
            const content = loadBlocks(item.children ?? [], state);
            if (content[0].type !== 'paragraph') content.unshift({ ...PLACEHOLDER });
            return { type: tasks ? 'taskItem' : 'listItem', attrs: itemAttrs, content };
        }),
    };
}

/** Definition lists and line blocks: their children are their own node types and comments. */
function loadMixed(node, name, state) {
    const children = node.children ?? [];
    if (children.length === 0) return blockAtom(node);
    return {
        type: name,
        attrs: { carve: carveAttr(fields(node, ['children'])) },
        content: children.map((child) => loadBlock(child, state)),
    };
}

function loadTable(node, state) {
    const sections = [];
    const rows = [];
    // Counts with no mark cells describe an imported span (C2-A-093); they save back without marks.
    const cells = (node.children ?? []).flatMap((section) => (section.children ?? []).flatMap((row) => row.children ?? []));
    const bare = !cells.some((cell) => cell.span !== undefined) && cells.some((cell) => cell.colspan > 1 || cell.rowspan > 1);
    for (const [index, section] of (node.children ?? []).entries()) {
        if (section.type === 'comment') {
            sections.push({ $node: clean(section) });
            continue;
        }
        const entry = { type: section.type, ...fields(section, ['children']) };
        sections.push(entry);
        let before = [];
        for (const row of section.children ?? []) {
            if (row.type === 'comment') {
                before.push(clean(row));
                continue;
            }
            const carve = { ...fields(row, ['children']), $section: index };
            if (before.length > 0) carve.$before = before;
            before = [];
            // ProseMirror has no cell where a span mark stands: the covering cell's counts span it.
            const content = (row.children ?? []).filter((cell) => cell.span === undefined).map((cell) => loadCell(cell, state));
            if (section.type !== 'table_head' && content.length > 0 && content.every((cell) => cell.type === 'tableHeader')) carve.$th = true;
            rows.push({ type: 'tableRow', attrs: { carve }, content });
        }
        if (before.length > 0) entry.$after = before;
        if (!(section.children ?? []).some((row) => row.type !== 'comment')) entry.$empty = true;
    }
    if (rows.length === 0 || rows.some((row) => row.content.length === 0)) return blockAtom(node);
    // ProseMirror tables are rectangular: short rows get marked padding cells, which the way back drops while empty.
    const widths = gridWidths(rows.map((row) => row.content.map((cell) => [cell.attrs.colspan ?? 1, cell.attrs.rowspan ?? 1])));
    const width = Math.max(...widths);
    for (const [index, row] of rows.entries()) {
        for (let column = widths[index]; column < width; column++) {
            row.content.push({ type: 'tableCell', attrs: { carve: { $pad: true } }, content: [{ ...PLACEHOLDER }] });
        }
    }
    const carve = { ...fields(node, ['children']), $sections: sections };
    if (bare) carve.$bareSpans = true;
    return { type: 'table', attrs: { carve }, content: rows };
}

/** The width of each row of `rows` ([colspan, rowspan] per cell), row spans from above included. */
function gridWidths(rows) {
    const below = [];
    return rows.map((cells) => {
        const taken = below.map((count) => count > 0);
        let column = 0;
        for (const [colspan, rowspan] of cells) {
            while (taken[column]) column++;
            for (let offset = 0; offset < colspan; offset++) {
                if (rowspan > 1) below[column + offset] = Math.max(below[column + offset] ?? 0, rowspan);
                taken[column + offset] = true;
            }
            column += colspan;
        }
        const width = Math.max(column, taken.length);
        for (let index = 0; index < below.length; index++) below[index] = Math.max(0, (below[index] ?? 0) - 1);
        return width;
    });
}

function loadCell(cell, state) {
    const content = (cell.children ?? []).map((child) => child.type === 'cell_paragraph'
        ? loadTextblock({ ...child, type: 'paragraph' }, state, { $type: 'cell_paragraph' })
        : loadBlock(child, state));
    const carve = fields(cell, ['children', 'header', 'colspan', 'rowspan']);
    if (content.length === 0) carve.$empty = true;
    const attrs = { carve: carveAttr(carve) };
    if (cell.colspan > 1) attrs.colspan = cell.colspan;
    if (cell.rowspan > 1) attrs.rowspan = cell.rowspan;
    return {
        type: cell.header ? 'tableHeader' : 'tableCell',
        attrs,
        content: content.length > 0 ? content : [{ ...PLACEHOLDER }],
    };
}

function loadInlines(children, state) {
    const out = [];
    pushInlines(children, [], new Set(), out, state);
    return out;
}

function pushInlines(children, marks, open, out, state) {
    for (const child of children) {
        const hostMark = Array.isArray(child.children) && child.children.length > 0 ? loadMappedMark(child, state) : undefined;
        if (hostMark !== undefined && !open.has(hostMark.type)) {
            const inner = new Set(open);
            inner.add(hostMark.type);
            pushInlines(child.children, [...marks, hostMark], inner, out, state);
            continue;
        }
        const hostNode = loadMapped(child, 'inline', state);
        if (hostNode !== undefined) {
            out.push(withMarks(hostNode, marks));
            continue;
        }
        const spec = MARK_OF_TREE.get(child.type);
        if (spec !== undefined && Array.isArray(child.children) && child.children.length > 0 && !open.has(spec.mark)) {
            const attrs = { carve: { ...fields(child, ['children', ...spec.owned]), $id: ++state.id, $depth: marks.length } };
            for (const key of spec.owned) attrs[key] = child[key] ?? null;
            if (spec.mark === 'link' && denied(attrs.href, state)) {
                attrs.carve.href = attrs.href;
                attrs.href = null;
            }
            const inner = new Set(open);
            inner.add(spec.mark);
            pushInlines(child.children, [...marks, { type: spec.mark, attrs }], inner, out, state);
            continue;
        }
        out.push(loadLeaf(child, marks, open, state));
    }
}

function denied(url, state) {
    return typeof url === 'string' && !isUrlAllowed(url, state.urlPolicy);
}

function loadLeaf(node, marks, open, state) {
    switch (node.type) {
        case 'text':
            return node.value === '' ? inlineAtom(node, marks) : withMarks({ type: 'text', text: node.value }, marks);
        case 'code':
            if (node.value === '' || open.has('code')) return inlineAtom(node, marks);
            return {
                type: 'text',
                text: node.value,
                marks: [...marks, { type: 'code', attrs: { carve: { ...fields(node, ['value']), $id: ++state.id, $depth: marks.length } } }],
            };
        case 'hard_break':
            return withMarks({ type: 'hardBreak', attrs: { carve: carveAttr(fields(node)) } }, marks);
        case 'soft_break':
            return withMarks({ type: 'carveSoftBreak', attrs: { carve: carveAttr(fields(node)) } }, marks);
        case 'image': {
            const blank = denied(node.src, state);
            return withMarks({
                type: 'image',
                attrs: {
                    src: blank ? null : node.src ?? null,
                    alt: node.alt ?? null,
                    title: node.tooltip ?? null,
                    carve: carveAttr(fields(node, blank ? ['alt', 'tooltip'] : ['src', 'alt', 'tooltip'])),
                },
            }, marks);
        }
        case 'math':
            return withMarks({
                type: 'carveMath',
                attrs: { value: node.value, display: node.display === true, carve: carveAttr(fields(node, ['value', 'display'])) },
            }, marks);
        case 'footnote_ref':
            return withMarks({
                type: 'carveFootnoteRef',
                attrs: { key: node.key, carve: carveAttr(fields(node, ['key', 'namespace'])) },
            }, marks);
        default:
            return inlineAtom(node, marks);
    }
}

// ---------------------------------------------------------------------------
// ProseMirror to tree
// ---------------------------------------------------------------------------

/**
 * The Carve 0.2 document tree of ProseMirror JSON from an editor that uses the kit's schema
 * (`editor.getJSON()`), ready for carve-js `write`.
 *
 * @param {object} doc a ProseMirror `doc` node as JSON
 * @param {{ mapping?: object }} [options] `mapping`: the host's own nodes and marks
 * @returns {object} a `document` node
 */
export function proseMirrorToTree(doc, options = {}) {
    return proseMirrorToTreeWithOrigins(doc, options).tree;
}

/**
 * The tree of `doc`; for each top-level block the index of the loaded block it came from
 * (`undefined` for a block the editor added); by tree path, the JSON pointer of the ProseMirror
 * node or mark each tree node came from (`pointers`); and the attributes the save did not read.
 */
export function proseMirrorToTreeWithOrigins(doc, options = {}) {
    if (doc?.type !== 'doc') throw new TypeError('proseMirrorToTree expects a ProseMirror doc node');
    const ctx = { mapping: mappingOf(options.mapping), from: new WeakMap() };
    const children = [];
    const origins = [];
    for (const [at, pm] of (doc.content ?? []).entries()) {
        if (isPlaceholder(pm)) continue;
        const node = saveBlock(pm, ctx, `/content/${at}`);
        if (node === null) continue;
        children.push(node);
        const index = carveOf(pm).$index;
        origins.push(Number.isInteger(index) ? index : undefined);
    }
    const tree = { type: 'document', astVersion: '2.0', ...treeFields(carveOf(doc)), children };
    ctx.from.set(tree, '');
    return { tree, origins, pointers: pointersOf(tree, ctx.from), ignored: ignoredAttributes(doc, ctx.mapping) };
}

/** Each tree path with the pointer of the ProseMirror node or mark its node came from. */
function pointersOf(tree, from) {
    const out = {};
    const visit = (node, path) => {
        if (from.has(node)) out[path] = from.get(node);
        for (const [key, value] of Object.entries(node)) {
            if (Array.isArray(value)) {
                for (const [index, item] of value.entries()) if (typeof item?.type === 'string') visit(item, `${path}/${key}/${index}`);
            } else if (typeof value?.type === 'string') {
                visit(value, `${path}/${key}`);
            }
        }
    };
    visit(tree, '');
    return out;
}

/**
 * The ProseMirror JSON pointer for a tree path, such as the `path` of a lint finding on the
 * saved document: the pointer of that node, or of its nearest ancestor that came from one
 * (a span mark cell, a table section). Null when no ancestor did.
 *
 * @param {Record<string, string>} pointers the `pointers` of `proseMirrorToTreeWithOrigins`
 * @param {string} path
 * @returns {string | null}
 */
export function proseMirrorPointer(pointers, path) {
    let at = path;
    for (;;) {
        if (Object.hasOwn(pointers, at)) return pointers[at];
        if (at === '') return null;
        at = at.slice(0, at.lastIndexOf('/'));
    }
}

function tag(node, ctx, ptr) {
    if (node !== null && typeof node === 'object' && !ctx.from.has(node)) ctx.from.set(node, ptr);
    return node;
}

/** The attributes each node and mark reads; any other attribute with a value is reported as ignored. */
const READ = {
    heading: ['level'],
    codeBlock: ['language'],
    orderedList: ['start'],
    taskItem: ['checked'],
    tableCell: ['colspan', 'rowspan'],
    tableHeader: ['colspan', 'rowspan'],
    image: ['src', 'alt', 'title'],
    link: ['href'],
    carveAdmonition: ['kind'],
    carveMath: ['value', 'display'],
    carveFootnoteRef: ['key'],
};

/** Values the kit's own extensions give every node or mark of a type, which carry nothing to lose. */
const STOCK = { link: { target: '_blank', rel: 'noopener noreferrer nofollow' } };

/** Each attribute of `doc` the save did not read, with the JSON pointer of its node or mark. */
function ignoredAttributes(doc, mapping) {
    const out = [];
    const visit = (pm, path) => {
        const host = /\/marks\/\d+$/.test(path) ? mapping.marks.get(pm.type) : mapping.nodes.get(pm.type);
        // A declared mapping reads its attributes; a callback reads what it needs.
        const read = host !== undefined ? host.attributes ?? Object.keys(pm.attrs ?? {}) : READ[pm.type] ?? [];
        for (const [attribute, value] of Object.entries(pm.attrs ?? {})) {
            if (attribute === 'carve' || value === null || value === undefined || read.includes(attribute)) continue;
            if (STOCK[pm.type]?.[attribute] === value) continue;
            out.push({ path, type: pm.type, attribute, value });
        }
        // A `^` below a cell of more than one column joins nothing (C2-B-172), so such a cell keeps only its columns.
        if ((pm.type === 'tableCell' || pm.type === 'tableHeader') && spanCount(pm.attrs?.colspan) > 1 && spanCount(pm.attrs?.rowspan) > 1) {
            out.push({ path, type: pm.type, attribute: 'rowspan', value: pm.attrs.rowspan });
        }
        for (const [index, mark] of (pm.marks ?? []).entries()) visit(mark, `${path}/marks/${index}`);
        for (const [index, child] of (pm.content ?? []).entries()) visit(child, `${path}/content/${index}`);
    };
    visit(doc, '');
    return out;
}

/** An empty paragraph with nothing carried is editor state (a placeholder, a fresh line), not content. */
function isPlaceholder(pm) {
    return pm.type === 'paragraph' && (pm.content ?? []).length === 0 &&
        Object.keys(carveOf(pm)).every((key) => key === '$index');
}

/** `content` is the content of the node at `base`, from index `offset` on. */
function saveBlocks(content, ctx, base, offset = 0) {
    const out = [];
    for (const [index, pm] of content.entries()) {
        if (isPlaceholder(pm)) continue;
        const node = saveBlock(pm, ctx, `${base}/content/${index + offset}`);
        if (node !== null) out.push(node);
    }
    return out;
}

function saveBlock(pm, ctx, ptr) {
    return tag(saveBlockOf(pm, ctx, ptr), ctx, ptr);
}

function saveBlockOf(pm, ctx, ptr) {
    const carve = carveOf(pm);
    const host = ctx.mapping.nodes.get(pm.type);
    if (host !== undefined) return saveMapped(pm, host, 'block', ctx, ptr);
    if (TREE_OF_TEXTBLOCK.has(pm.type)) return saveTextblock(pm, ctx, ptr);
    if (TREE_OF_CONTAINER.has(pm.type)) return saveContainer(pm, ctx, ptr);
    if (TREE_OF_CODE.has(pm.type)) return { type: TREE_OF_CODE.get(pm.type), ...treeFields(carve), value: textOf(pm) };
    switch (pm.type) {
        case 'carveCaptioned': {
            const [body, caption] = pm.content ?? [];
            const node = saveBlock(body, ctx, `${ptr}/content/0`);
            // An empty caption the editor made (to fill the wrapper) is no caption.
            const empty = caption === undefined || (carveOf(caption).$empty !== true && (caption.content ?? []).every(isPlaceholder));
            if (node !== null && !empty) node.caption = saveBlock(caption, ctx, `${ptr}/content/1`);
            return node;
        }
        case 'carveBlock': {
            const { $index: _index, ...node } = carve;
            return clean(node);
        }
        case 'codeBlock': {
            const text = textOf(pm);
            const node = { type: 'code_block', ...treeFields(carve), value: text + (carve.$newline === false || text.endsWith('\n') ? '' : '\n') };
            const language = pm.attrs?.language;
            if (typeof language === 'string' && language !== '') node.syntax = language;
            return node;
        }
        case 'horizontalRule': return { type: 'thematic_break', ...treeFields(carve) };
        case 'bulletList':
        case 'orderedList':
        case 'taskList': return saveList(pm, ctx, ptr);
        case 'carveDefinitionList': return { type: 'definition_list', ...treeFields(carve), children: saveBlocks(pm.content ?? [], ctx, ptr) };
        case 'carveLineBlock': return { type: 'line_block', ...treeFields(carve), children: saveBlocks(pm.content ?? [], ctx, ptr) };
        case 'table': return saveTable(pm, ctx, ptr);
        // A block image, as Tiptap's Image extension makes by default, is an image paragraph (C2-A-136, C2-H-020).
        case 'image': return { type: 'paragraph', role: 'image', children: [saveLeaf(pm, ctx, ptr)] };
        default: throw new TypeError(`proseMirrorToTree: no Carve node for the ProseMirror node "${pm.type}"`);
    }
}

function textOf(pm) {
    return (pm.content ?? []).map((child) => child.text ?? '').join('');
}

function saveTextblock(pm, ctx, ptr) {
    const { tree, owned } = TREE_OF_TEXTBLOCK.get(pm.type);
    const carve = carveOf(pm);
    const node = { type: carve.$type ?? tree, ...treeFields(carve) };
    for (const key of owned) if (pm.attrs?.[key] !== undefined && pm.attrs[key] !== null) node[key] = pm.attrs[key];
    node.children = saveInlines(pm.content ?? [], ctx, ptr);
    return node;
}

function saveContainer(pm, ctx, ptr) {
    const { tree, owned } = TREE_OF_CONTAINER.get(pm.type);
    const node = { type: tree, ...treeFields(carveOf(pm)) };
    for (const key of owned) if (pm.attrs?.[key] !== undefined && pm.attrs[key] !== null) node[key] = pm.attrs[key];
    let content = pm.content ?? [];
    let offset = 0;
    if (content[0]?.type === 'carveTitle') {
        const title = saveInlines(content[0].content ?? [], ctx, `${ptr}/content/0`);
        if (title.length > 0) node.title = title;
        content = content.slice(1);
        offset = 1;
    }
    node.children = saveBlocks(content, ctx, ptr, offset);
    return node;
}

function defaultMarker(type) {
    return type === 'orderedList' ? { kind: 'ordered', style: '1', delimiter: '.' } : { kind: 'bullet', char: '-' };
}

function saveList(pm, ctx, ptr) {
    const fieldsOf = treeFields(carveOf(pm));
    let marker = fieldsOf.marker;
    const wanted = pm.type === 'orderedList' ? 'ordered' : pm.type === 'bulletList' ? 'bullet' : null;
    if (marker === undefined || (wanted !== null && marker.kind !== wanted)) marker = defaultMarker(pm.type);
    if (pm.type === 'orderedList' && Number.isInteger(pm.attrs?.start) && pm.attrs.start !== (marker.start ?? 1)) {
        marker = { ...marker, start: pm.attrs.start };
    }
    // An item with nothing in it is what Enter or a toggle leaves behind, unless it was loaded empty.
    const items = [...(pm.content ?? []).entries()]
        .filter(([, item]) => carveOf(item).$empty === true || !(item.content ?? []).every(isPlaceholder));
    if (items.length === 0) return null;
    return {
        type: 'list',
        spacing: 'tight',
        ...fieldsOf,
        marker,
        children: items.map(([at, item]) => {
            const itemPtr = `${ptr}/content/${at}`;
            const itemFields = treeFields(carveOf(item));
            const node = tag({ type: 'list_item', ...itemFields }, ctx, itemPtr);
            if (item.type === 'taskItem') {
                const checked = item.attrs?.checked === true;
                if (itemFields.task === undefined || taskChecked(itemFields.task) !== checked) node.task = { mark: checked ? 'x' : ' ' };
            }
            node.children = saveBlocks(item.content ?? [], ctx, itemPtr);
            return node;
        }),
    };
}

function saveTable(pm, ctx, ptr) {
    const carve = carveOf(pm);
    const sections = Array.isArray(carve.$sections) && carve.$sections.length > 0 ? [...carve.$sections] : [{ type: 'table_body' }];
    const pmRows = (pm.content ?? []).map((row, at) => {
        const kept = [...(row.content ?? []).entries()]
            .filter(([, cell]) => carveOf(cell).$pad !== true || !(cell.content ?? []).every(isPlaceholder));
        return {
            carve: carveOf(row),
            cells: kept.map(([, cell]) => cell),
            ptr: `${ptr}/content/${at}`,
            cellPtrs: kept.map(([index]) => `${ptr}/content/${at}/content/${index}`),
        };
    });
    // C2-B-178: in a table without a head, the leading rows of header cells are the head; a row loaded so stays.
    let lead = 0;
    if (!sections.some((section) => section.type === 'table_head')) {
        while (lead < pmRows.length && pmRows[lead].carve.$th !== true && headerRow(pmRows[lead].cells)) lead++;
    }
    let shift = 0;
    if (lead > 0) {
        const first = sections.findIndex((section) => section.$node === undefined);
        sections.splice(Math.max(first, 0), 0, { type: 'table_head' });
        shift = Math.max(first, 0);
    }
    // A body row added after a head that has no body behind it needs one; loaded rows keep their sections.
    const head = sections.findIndex((section) => section.type === 'table_head');
    let added = -1;
    if (head >= 0 && !sections.some((section, index) => index > head && section.type === 'table_body')) {
        sections.splice(head + 1, 0, { type: 'table_body' });
        added = head + 1;
    }
    const sectionOf = (index) => {
        let at = lead > 0 && index >= shift ? index + 1 : index;
        if (added >= 0 && at >= added) at++;
        return at;
    };
    let current = sections.findIndex((section) => section.type === 'table_body');
    if (current < 0) current = sections.findIndex((section) => section.$node === undefined);
    const placed = [];
    for (const [index, row] of pmRows.entries()) {
        if (index < lead) {
            current = head;
        } else if (Number.isInteger(row.carve.$section) && sections[sectionOf(row.carve.$section)] !== undefined) {
            current = sectionOf(row.carve.$section);
        } else if (sections[current]?.type === 'table_head' && !headerRow(row.cells)) {
            current = sections.findIndex((section, at) => at > current && section.type === 'table_body');
        }
        placed.push({ ...row, section: current });
    }
    const rowsOf = sections.map(() => []);
    const width = spanRows(placed, carve.$bareSpans === true, rowsOf, ctx);
    const children = [];
    for (const [index, section] of sections.entries()) {
        if (section.$node !== undefined) {
            children.push(section.$node);
            continue;
        }
        const rows = rowsOf[index];
        if (!rows.some((row) => row.type === 'table_row') && section.$empty !== true) continue;
        if (Array.isArray(section.$after)) rows.push(...section.$after);
        children.push({ ...treeFields(section), type: section.type, children: rows });
    }
    const node = { type: 'table', ...treeFields(carve), children };
    const columns = Array.isArray(node.columns) ? node.columns.slice(0, width) : [];
    while (columns.length < width) columns.push({ type: 'table_column' });
    node.columns = columns;
    return node;
}

function headerRow(cells) {
    return cells.length > 0 && cells.every((cell) => cell.type === 'tableHeader');
}

function spanCount(value) {
    return Number.isInteger(value) && value > 1 ? value : 1;
}

const COLSPAN_MARK = { type: 'table_cell', header: false, span: 'colspan', children: [] };
const ROWSPAN_MARK = { type: 'table_cell', header: false, span: 'rowspan', children: [] };

/**
 * Saves the rows into `rowsOf`; returns the width of the widest row. A span becomes the cell's counts and the mark
 * cells it covers (C2-B-172 to C2-B-174): a row span stops at the end of its group, and a cell that spans both ways
 * keeps its columns, since a `^` below a cell of more than one column joins nothing.
 */
function spanRows(placed, bare, rowsOf, ctx) {
    let below = [];
    let width = 0;
    for (const [index, row] of placed.entries()) {
        if (index > 0 && placed[index - 1].section !== row.section) below = [];
        const groupLeft = placed.slice(index).findIndex((later) => later.section !== row.section);
        const left = groupLeft < 0 ? placed.length - index : groupLeft;
        const cells = [];
        let column = 0;
        const covered = () => {
            while ((below[column] ?? 0) > 0) {
                if (!bare) cells.push({ ...ROWSPAN_MARK });
                column++;
            }
        };
        for (const [at, pmCell] of row.cells.entries()) {
            covered();
            const cell = saveCell(pmCell, ctx, row.cellPtrs[at]);
            const colspan = spanCount(pmCell.attrs?.colspan);
            let rowspan = Math.min(spanCount(pmCell.attrs?.rowspan), left);
            if (colspan > 1 && rowspan > 1 && !bare) rowspan = 1;
            if (colspan > 1) cell.colspan = colspan;
            if (rowspan > 1) cell.rowspan = rowspan;
            cells.push(cell);
            for (let offset = 1; offset < colspan; offset++) if (!bare) cells.push({ ...COLSPAN_MARK });
            for (let offset = 0; offset < colspan; offset++) if (rowspan > 1) below[column + offset] = rowspan;
            column += colspan;
        }
        covered();
        width = Math.max(width, column);
        below = below.map((count) => Math.max(0, (count ?? 0) - 1));
        if (Array.isArray(row.carve.$before)) rowsOf[row.section].push(...row.carve.$before);
        rowsOf[row.section].push(tag({ type: 'table_row', ...treeFields(row.carve), children: cells }, ctx, row.ptr));
    }
    return width;
}

function saveCell(pm, ctx, ptr) {
    const content = pm.content ?? [];
    const single = content.filter((child) => !isPlaceholder(child)).length === 1;
    const children = [];
    for (const [at, child] of content.entries()) {
        if (isPlaceholder(child)) continue;
        const node = saveBlock(child, ctx, `${ptr}/content/${at}`);
        if (node === null) continue;
        if ((child.type === 'paragraph' || child.type === 'image') && carveOf(child).$type === undefined && single) {
            node.type = 'cell_paragraph';
            delete node.role;
        }
        children.push(node);
    }
    // A cell the editor created empty still needs content; an empty cell reads as one empty cell paragraph.
    if (children.length === 0 && carveOf(pm).$empty !== true) children.push({ type: 'cell_paragraph', children: [] });
    const { colspan: _colspan, rowspan: _rowspan, ...carved } = treeFields(carveOf(pm));
    return tag({ type: 'table_cell', ...carved, header: pm.type === 'tableHeader', children }, ctx, ptr);
}

/** A mark's identity: the loaded node it came from, or for a mark the editor added, its type and attributes. */
function markKey(mark) {
    const id = mark.attrs?.carve?.$id;
    return id !== undefined ? `#${id}` : `${mark.type}:${JSON.stringify(mark.attrs ?? {})}`;
}

function saveInlines(content, ctx, base) {
    const leaves = content.map((pm, at) => {
        const ptr = `${base}/content/${at}`;
        const kept = [...(pm.marks ?? []).entries()].filter(([, mark]) => mark.type !== 'code');
        const marks = kept.map(([, mark]) => mark);
        return { pm, ptr, marks, markPtrs: kept.map(([index]) => `${ptr}/marks/${index}`), keys: marks.map(markKey) };
    });
    // How far each mark runs from each leaf: a longer run opens outside a shorter one.
    const runs = leaves.map(() => new Map());
    for (let index = leaves.length - 1; index >= 0; index--) {
        for (const key of leaves[index].keys) runs[index].set(key, 1 + (runs[index + 1]?.get(key) ?? 0));
    }
    const root = { children: [] };
    const stack = [];
    for (const [index, leaf] of leaves.entries()) {
        let keep = 0;
        while (keep < stack.length && leaf.keys.includes(stack[keep].key)) keep++;
        stack.length = keep;
        const opened = new Set(stack.map((entry) => entry.key));
        const fresh = leaf.marks
            .map((mark, order) => ({ mark, order, key: leaf.keys[order], ptr: leaf.markPtrs[order] }))
            .filter((entry) => !opened.has(entry.key))
            .sort((a, b) => runs[index].get(b.key) - runs[index].get(a.key) ||
                (a.mark.attrs?.carve?.$depth ?? Infinity) - (b.mark.attrs?.carve?.$depth ?? Infinity) ||
                a.order - b.order);
        for (const entry of fresh) {
            const node = tag(markNode(entry.mark, ctx), ctx, entry.ptr);
            (stack[stack.length - 1]?.node ?? root).children.push(node);
            stack.push({ key: entry.key, node });
        }
        (stack[stack.length - 1]?.node ?? root).children.push(saveLeaf(leaf.pm, ctx, leaf.ptr));
    }
    return root.children;
}

function markNode(mark, ctx) {
    const host = ctx.mapping.marks.get(mark.type);
    if (host !== undefined) return saveMappedMark(mark, host);
    const spec = TREE_OF_MARK.get(mark.type);
    if (spec === undefined) throw new TypeError(`proseMirrorToTree: no Carve node for the ProseMirror mark "${mark.type}"`);
    const node = { type: spec.tree, ...treeFields(mark.attrs?.carve) };
    for (const key of spec.owned) if (mark.attrs?.[key] !== undefined && mark.attrs[key] !== null) node[key] = mark.attrs[key];
    node.children = [];
    return node;
}

function saveLeaf(pm, ctx, ptr) {
    return tag(saveLeafOf(pm, ctx, ptr), ctx, ptr);
}

function saveLeafOf(pm, ctx, ptr) {
    const host = ctx.mapping.nodes.get(pm.type);
    if (host !== undefined) return saveMapped(pm, host, 'inline', ctx, ptr);
    const carve = carveOf(pm);
    switch (pm.type) {
        case 'text': {
            const code = (pm.marks ?? []).find((mark) => mark.type === 'code');
            if (code !== undefined) return { type: 'code', ...treeFields(code.attrs?.carve), value: pm.text };
            return { type: 'text', value: pm.text };
        }
        case 'hardBreak': return { type: 'hard_break', ...treeFields(carve) };
        case 'carveSoftBreak': return { type: 'soft_break', ...treeFields(carve) };
        case 'image': {
            const node = { type: 'image', ...treeFields(carve) };
            for (const [attr, key] of [['src', 'src'], ['alt', 'alt'], ['title', 'tooltip']]) {
                const value = pm.attrs?.[attr];
                if (typeof value === 'string') node[key] = value;
            }
            return node;
        }
        case 'carveMath': return { type: 'math', ...treeFields(carve), display: pm.attrs?.display === true, value: pm.attrs?.value ?? '' };
        case 'carveFootnoteRef': return { type: 'footnote_ref', ...treeFields(carve), key: String(pm.attrs?.key ?? ''), namespace: 'footnote' };
        case 'carveInline': return clean(carve);
        default: throw new TypeError(`proseMirrorToTree: no Carve node for the ProseMirror inline "${pm.type}"`);
    }
}
