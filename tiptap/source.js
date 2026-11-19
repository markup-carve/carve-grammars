import { proseMirrorToTree, treeToProseMirror } from './tree.js';

function requireEngine(engine, names) {
    for (const name of names) {
        if (typeof engine?.[name] !== 'function') {
            throw new TypeError(`The Carve kit needs the carve-js engine: pass { engine } with a ${name}() function`);
        }
    }
    return engine;
}

/**
 * ProseMirror JSON of Carve 0.2 source, read by the engine the host passes (carve-js `parse`).
 *
 * @param {string} source
 * @param {{ engine: { parse: Function }, parse?: object }} options
 */
export function carveToProseMirror(source, options = {}) {
    const engine = requireEngine(options.engine, ['parse']);
    return treeToProseMirror(engine.parse(String(source ?? ''), { ...options.parse, positions: false }));
}

/** Byte offsets of a parse are UTF-8; the string offsets of the same places. */
function stringOffsets(source) {
    const map = new Map();
    let bytes = 0;
    for (let index = 0; index < source.length; index++) {
        map.set(bytes, index);
        const code = source.codePointAt(index);
        if (code > 0xffff) {
            bytes += 4;
            index++;
        } else {
            bytes += code > 0x7ff ? 3 : code > 0x7f ? 2 : 1;
        }
    }
    map.set(bytes, source.length);
    return map;
}

/** The layout entries of the original blocks `from` to `from + count`, as paths into a document of those blocks. */
function runLayout(layout, from, count) {
    const nodes = [];
    for (const entry of layout.nodes ?? []) {
        const match = /^\/children\/(\d+)(\/.*)?$/.exec(entry.path ?? '');
        if (match === null) continue;
        const index = Number(match[1]) - from;
        if (index >= 0 && index < count) nodes.push({ ...entry, path: `/children/${index}${match[2] ?? ''}` });
    }
    return { nodes };
}

/**
 * Source for `tree` that keeps the original text of the top-level blocks an edit left alone:
 * runs of unchanged blocks keep their source, the other runs are written by the engine. A changed
 * run that stands where as many original blocks of the same types stood is written with their
 * layout, so the writer keeps their spelling (fences, markers) where it can.
 */
function splice(tree, original, layout, source, engine, writeOptions) {
    const before = original.children ?? [];
    const after = tree.children ?? [];
    if (before.length === 0 || before.some((node) => node.pos?.startOffset === undefined)) return null;
    const offsets = stringOffsets(source);
    const matches = [];
    let cursor = 0;
    for (const node of after) {
        let match = -1;
        for (let index = cursor; index < before.length && index < cursor + 8; index++) {
            if (engine.treesEqual(node, before[index])) {
                match = index;
                break;
            }
        }
        matches.push(match);
        if (match >= 0) cursor = match + 1;
    }
    const parts = [];
    for (let index = 0; index < after.length;) {
        let last = index;
        if (matches[index] >= 0) {
            while (last + 1 < after.length && matches[last + 1] === matches[last] + 1) last++;
            const start = offsets.get(before[matches[index]].pos.startOffset);
            const end = offsets.get(before[matches[last]].pos.endOffset);
            if (start === undefined || end === undefined) return null;
            parts.push(source.slice(start, end));
            index = last + 1;
            continue;
        }
        while (last < after.length && matches[last] < 0) last++;
        const run = after.slice(index, last);
        const from = index > 0 ? matches[index - 1] + 1 : 0;
        const olds = before.slice(from, last < after.length ? matches[last] : before.length);
        const document = { ...tree, children: run };
        let written = null;
        if (layout !== null && olds.length === run.length && olds.every((node, at) => node.type === run[at].type)) {
            try {
                written = engine.write(document, { ...writeOptions, layout: runLayout(layout, from, run.length) });
            } catch {
                written = null;
            }
        }
        parts.push((written ?? engine.write(document, writeOptions)).replace(/\n+$/, ''));
        index = last;
    }
    return `${parts.join('\n\n')}\n`;
}

/**
 * Carve 0.2 source of ProseMirror JSON (`editor.getJSON()`), written by the engine the host
 * passes (carve-js `write`). With `source`, the source the document was loaded from, an
 * unedited document returns `source` unchanged and the blocks an edit left alone keep their
 * text where the result reads back as the same tree. With the engine's `parseWithLayout`, an
 * edited block is written with its original layout, so the writer keeps its spelling where it can.
 *
 * @param {object} doc
 * @param {{ engine: { parse: Function, write: Function, treesEqual: Function, parseWithLayout?: Function }, source?: string, parse?: object, write?: object }} options
 */
export function serializeToCarve(doc, options = {}) {
    const engine = requireEngine(options.engine, ['write']);
    const tree = proseMirrorToTree(doc);
    if (typeof options.source !== 'string') return engine.write(tree, options.write);
    requireEngine(engine, ['parse', 'treesEqual']);
    const withLayout = typeof engine.parseWithLayout === 'function' ? engine.parseWithLayout(options.source, options.parse) : null;
    const original = withLayout?.document ?? engine.parse(options.source, options.parse);
    if (engine.treesEqual(tree, original)) return options.source;
    const full = engine.write(tree, options.write);
    const spliced = splice(tree, original, withLayout?.layout ?? null, options.source, engine, options.write);
    if (spliced === null || spliced === full) return full;
    return engine.treesEqual(engine.parse(spliced, options.parse), engine.parse(full, options.parse)) ? spliced : full;
}
