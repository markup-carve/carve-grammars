/**
 * The mapping between the Carve 0.2 tree and ProseMirror JSON.
 *
 * Each ProseMirror node and mark keeps the tree fields the editor does not own in its `carve`
 * attribute, so `proseMirrorToTree(treeToProseMirror(tree))` gives the same tree for any
 * document. A node the content model cannot hold becomes an atom that carries the whole node.
 * `$`-prefixed keys of `carve` are the kit's own bookkeeping; no tree field starts with `$`.
 */

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
// Tree to ProseMirror
// ---------------------------------------------------------------------------

/**
 * ProseMirror JSON of a Carve 0.2 document tree (the result of carve-js `parse`).
 *
 * @param {object} tree a `document` node
 * @returns {object} a ProseMirror `doc` node as JSON
 */
export function treeToProseMirror(tree) {
    if (tree?.type !== 'document') throw new TypeError('treeToProseMirror expects a Carve document tree');
    const state = { id: 0 };
    return {
        type: 'doc',
        attrs: { carve: carveAttr(fields(tree, ['children'])) },
        content: loadBlocks(tree.children ?? [], state),
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
    const text = newline ? value.slice(0, -1) : value;
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
            rows.push({ type: 'tableRow', attrs: { carve }, content: (row.children ?? []).map((cell) => loadCell(cell, state)) });
        }
        if (before.length > 0) entry.$after = before;
        if (!(section.children ?? []).some((row) => row.type !== 'comment')) entry.$empty = true;
    }
    if (rows.length === 0 || rows.some((row) => row.content.length === 0)) return blockAtom(node);
    // ProseMirror tables are rectangular: short rows get marked padding cells, which the way back drops while empty.
    const width = Math.max(...rows.map((row) => row.content.length));
    for (const row of rows) {
        while (row.content.length < width) {
            row.content.push({ type: 'tableCell', attrs: { carve: { $pad: true } }, content: [{ ...PLACEHOLDER }] });
        }
    }
    return { type: 'table', attrs: { carve: { ...fields(node, ['children']), $sections: sections } }, content: rows };
}

function loadCell(cell, state) {
    const content = (cell.children ?? []).map((child) => child.type === 'cell_paragraph'
        ? loadTextblock({ ...child, type: 'paragraph' }, state, { $type: 'cell_paragraph' })
        : loadBlock(child, state));
    const carve = fields(cell, ['children', 'header']);
    if (content.length === 0) carve.$empty = true;
    return {
        type: cell.header ? 'tableHeader' : 'tableCell',
        attrs: { carve: carveAttr(carve) },
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
        const spec = MARK_OF_TREE.get(child.type);
        if (spec !== undefined && Array.isArray(child.children) && child.children.length > 0 && !open.has(spec.mark)) {
            const attrs = { carve: { ...fields(child, ['children', ...spec.owned]), $id: ++state.id, $depth: marks.length } };
            for (const key of spec.owned) attrs[key] = child[key] ?? null;
            const inner = new Set(open);
            inner.add(spec.mark);
            pushInlines(child.children, [...marks, { type: spec.mark, attrs }], inner, out, state);
            continue;
        }
        out.push(loadLeaf(child, marks, open, state));
    }
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
        case 'image':
            return withMarks({
                type: 'image',
                attrs: {
                    src: node.src ?? null,
                    alt: node.alt ?? null,
                    title: node.tooltip ?? null,
                    carve: carveAttr(fields(node, ['src', 'alt', 'tooltip'])),
                },
            }, marks);
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
 * @returns {object} a `document` node
 */
export function proseMirrorToTree(doc) {
    if (doc?.type !== 'doc') throw new TypeError('proseMirrorToTree expects a ProseMirror doc node');
    return { type: 'document', astVersion: '2.0', ...treeFields(carveOf(doc)), children: saveBlocks(doc.content ?? []) };
}

/** An empty paragraph with nothing carried is editor state (a placeholder, a fresh line), not content. */
function isPlaceholder(pm) {
    return pm.type === 'paragraph' && (pm.content ?? []).length === 0 && Object.keys(carveOf(pm)).length === 0;
}

function saveBlocks(content) {
    const out = [];
    for (const pm of content) {
        if (isPlaceholder(pm)) continue;
        const node = saveBlock(pm);
        if (node !== null) out.push(node);
    }
    return out;
}

function saveBlock(pm) {
    const carve = carveOf(pm);
    if (TREE_OF_TEXTBLOCK.has(pm.type)) return saveTextblock(pm);
    if (TREE_OF_CONTAINER.has(pm.type)) return saveContainer(pm);
    if (TREE_OF_CODE.has(pm.type)) return { type: TREE_OF_CODE.get(pm.type), ...treeFields(carve), value: textOf(pm) };
    switch (pm.type) {
        case 'carveCaptioned': {
            const [body, caption] = pm.content ?? [];
            const node = saveBlock(body);
            // An empty caption the editor made (to fill the wrapper) is no caption.
            const empty = caption === undefined || (carveOf(caption).$empty !== true && (caption.content ?? []).every(isPlaceholder));
            if (node !== null && !empty) node.caption = saveBlock(caption);
            return node;
        }
        case 'carveBlock': return clean(carve);
        case 'codeBlock': {
            const node = { type: 'code_block', ...treeFields(carve), value: textOf(pm) + (carve.$newline === false ? '' : '\n') };
            const language = pm.attrs?.language;
            if (typeof language === 'string' && language !== '') node.syntax = language;
            return node;
        }
        case 'horizontalRule': return { type: 'thematic_break', ...treeFields(carve) };
        case 'bulletList':
        case 'orderedList':
        case 'taskList': return saveList(pm);
        case 'carveDefinitionList': return { type: 'definition_list', ...treeFields(carve), children: saveBlocks(pm.content ?? []) };
        case 'carveLineBlock': return { type: 'line_block', ...treeFields(carve), children: saveBlocks(pm.content ?? []) };
        case 'table': return saveTable(pm);
        default: throw new TypeError(`proseMirrorToTree: no Carve node for the ProseMirror node "${pm.type}"`);
    }
}

function textOf(pm) {
    return (pm.content ?? []).map((child) => child.text ?? '').join('');
}

function saveTextblock(pm) {
    const { tree, owned } = TREE_OF_TEXTBLOCK.get(pm.type);
    const carve = carveOf(pm);
    const node = { type: carve.$type ?? tree, ...treeFields(carve) };
    for (const key of owned) if (pm.attrs?.[key] !== undefined && pm.attrs[key] !== null) node[key] = pm.attrs[key];
    node.children = saveInlines(pm.content ?? []);
    return node;
}

function saveContainer(pm) {
    const { tree, owned } = TREE_OF_CONTAINER.get(pm.type);
    const node = { type: tree, ...treeFields(carveOf(pm)) };
    for (const key of owned) if (pm.attrs?.[key] !== undefined && pm.attrs[key] !== null) node[key] = pm.attrs[key];
    let content = pm.content ?? [];
    if (content[0]?.type === 'carveTitle') {
        const title = saveInlines(content[0].content ?? []);
        if (title.length > 0) node.title = title;
        content = content.slice(1);
    }
    node.children = saveBlocks(content);
    return node;
}

function defaultMarker(type) {
    return type === 'orderedList' ? { kind: 'ordered', style: '1', delimiter: '.' } : { kind: 'bullet', char: '-' };
}

function saveList(pm) {
    const fieldsOf = treeFields(carveOf(pm));
    let marker = fieldsOf.marker;
    const wanted = pm.type === 'orderedList' ? 'ordered' : pm.type === 'bulletList' ? 'bullet' : null;
    if (marker === undefined || (wanted !== null && marker.kind !== wanted)) marker = defaultMarker(pm.type);
    if (pm.type === 'orderedList' && Number.isInteger(pm.attrs?.start) && pm.attrs.start !== (marker.start ?? 1)) {
        marker = { ...marker, start: pm.attrs.start };
    }
    // An item with nothing in it is what Enter or a toggle leaves behind, unless it was loaded empty.
    const items = (pm.content ?? []).filter((item) => carveOf(item).$empty === true || !(item.content ?? []).every(isPlaceholder));
    if (items.length === 0) return null;
    return {
        type: 'list',
        spacing: 'tight',
        ...fieldsOf,
        marker,
        children: items.map((item) => {
            const itemFields = treeFields(carveOf(item));
            const node = { type: 'list_item', ...itemFields };
            if (item.type === 'taskItem') {
                const checked = item.attrs?.checked === true;
                if (itemFields.task === undefined || taskChecked(itemFields.task) !== checked) node.task = { mark: checked ? 'x' : ' ' };
            }
            node.children = saveBlocks(item.content ?? []);
            return node;
        }),
    };
}

function saveTable(pm) {
    const carve = carveOf(pm);
    const sections = Array.isArray(carve.$sections) && carve.$sections.length > 0 ? carve.$sections : [{ type: 'table_body' }];
    const rowsOf = sections.map(() => []);
    let current = sections.findIndex((section) => section.type === 'table_body');
    if (current < 0) current = sections.findIndex((section) => section.$node === undefined);
    let width = 0;
    for (const row of pm.content ?? []) {
        const rowCarve = carveOf(row);
        if (Number.isInteger(rowCarve.$section) && rowsOf[rowCarve.$section] !== undefined) current = rowCarve.$section;
        const content = (row.content ?? []).filter((cell) => carveOf(cell).$pad !== true || !(cell.content ?? []).every(isPlaceholder));
        const cells = content.map(saveCell);
        width = Math.max(width, cells.length);
        if (Array.isArray(rowCarve.$before)) rowsOf[current].push(...rowCarve.$before);
        rowsOf[current].push({ type: 'table_row', ...treeFields(rowCarve), children: cells });
    }
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

function saveCell(pm) {
    const content = pm.content ?? [];
    const single = content.filter((child) => !isPlaceholder(child)).length === 1;
    const children = [];
    for (const child of content) {
        if (isPlaceholder(child)) continue;
        const node = saveBlock(child);
        if (node === null) continue;
        if (child.type === 'paragraph' && carveOf(child).$type === undefined && single) node.type = 'cell_paragraph';
        children.push(node);
    }
    // A cell the editor created empty still needs content; an empty cell reads as one empty cell paragraph.
    if (children.length === 0 && carveOf(pm).$empty !== true) children.push({ type: 'cell_paragraph', children: [] });
    return { type: 'table_cell', ...treeFields(carveOf(pm)), header: pm.type === 'tableHeader', children };
}

/** A mark's identity: the loaded node it came from, or for a mark the editor added, its type and attributes. */
function markKey(mark) {
    const id = mark.attrs?.carve?.$id;
    return id !== undefined ? `#${id}` : `${mark.type}:${JSON.stringify(mark.attrs ?? {})}`;
}

function saveInlines(content) {
    const leaves = content.map((pm) => {
        const marks = (pm.marks ?? []).filter((mark) => mark.type !== 'code');
        return { pm, marks, keys: marks.map(markKey) };
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
            .map((mark, order) => ({ mark, order, key: leaf.keys[order] }))
            .filter((entry) => !opened.has(entry.key))
            .sort((a, b) => runs[index].get(b.key) - runs[index].get(a.key) ||
                (a.mark.attrs?.carve?.$depth ?? Infinity) - (b.mark.attrs?.carve?.$depth ?? Infinity) ||
                a.order - b.order);
        for (const entry of fresh) {
            const node = markNode(entry.mark);
            (stack[stack.length - 1]?.node ?? root).children.push(node);
            stack.push({ key: entry.key, node });
        }
        (stack[stack.length - 1]?.node ?? root).children.push(saveLeaf(leaf.pm));
    }
    return root.children;
}

function markNode(mark) {
    const spec = TREE_OF_MARK.get(mark.type);
    if (spec === undefined) throw new TypeError(`proseMirrorToTree: no Carve node for the ProseMirror mark "${mark.type}"`);
    const node = { type: spec.tree, ...treeFields(mark.attrs?.carve) };
    for (const key of spec.owned) if (mark.attrs?.[key] !== undefined && mark.attrs[key] !== null) node[key] = mark.attrs[key];
    node.children = [];
    return node;
}

function saveLeaf(pm) {
    const carve = carveOf(pm);
    switch (pm.type) {
        case 'text': {
            const code = (pm.marks ?? []).find((mark) => mark.type === 'code');
            if (code !== undefined) return { type: 'code', ...treeFields(code.attrs?.carve), value: pm.text };
            return { type: 'text', value: pm.text };
        }
        case 'hardBreak': return { type: 'hard_break', ...treeFields(carve) };
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
