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

/**
 * Source for `tree` that keeps the original text of the top-level blocks an edit left alone:
 * runs of unchanged blocks keep their source, the other runs are written by the engine.
 */
function splice(tree, original, source, engine, writeOptions) {
    const before = original.children ?? [];
    const after = tree.children ?? [];
    if (before.length === 0 || before.some((node) => node.pos?.startOffset === undefined)) return null;
    const offsets = stringOffsets(source);
    const at = (byte) => offsets.get(byte);
    const parts = [];
    let pending = [];
    let kept = null;
    const flushWritten = () => {
        if (pending.length === 0) return;
        parts.push(engine.write({ ...tree, children: pending }, writeOptions).replace(/\n+$/, ''));
        pending = [];
    };
    const flushKept = () => {
        if (kept === null) return;
        const start = at(before[kept.from].pos.startOffset);
        const end = at(before[kept.to].pos.endOffset);
        if (start === undefined || end === undefined) return 'fail';
        parts.push(source.slice(start, end));
        kept = null;
    };
    let cursor = 0;
    for (const node of after) {
        let match = -1;
        for (let index = cursor; index < before.length && index < cursor + 8; index++) {
            if (engine.treesEqual(node, before[index])) {
                match = index;
                break;
            }
        }
        if (match < 0) {
            if (flushKept() === 'fail') return null;
            pending.push(node);
            continue;
        }
        flushWritten();
        if (kept !== null && kept.to + 1 !== match && flushKept() === 'fail') return null;
        kept = kept === null ? { from: match, to: match } : { from: kept.from, to: match };
        cursor = match + 1;
    }
    if (flushKept() === 'fail') return null;
    flushWritten();
    return `${parts.join('\n\n')}\n`;
}

/**
 * Carve 0.2 source of ProseMirror JSON (`editor.getJSON()`), written by the engine the host
 * passes (carve-js `write`). With `source`, the source the document was loaded from, an
 * unedited document returns `source` unchanged and the blocks an edit left alone keep their
 * text where the result reads back as the same tree.
 *
 * @param {object} doc
 * @param {{ engine: { parse: Function, write: Function, treesEqual: Function }, source?: string, parse?: object, write?: object }} options
 */
export function serializeToCarve(doc, options = {}) {
    const engine = requireEngine(options.engine, ['write']);
    const tree = proseMirrorToTree(doc);
    if (typeof options.source !== 'string') return engine.write(tree, options.write);
    requireEngine(engine, ['parse', 'treesEqual']);
    const original = engine.parse(options.source, options.parse);
    if (engine.treesEqual(tree, original)) return options.source;
    const full = engine.write(tree, options.write);
    const spliced = splice(tree, original, options.source, engine, options.write);
    if (spliced === null || spliced === full) return full;
    return engine.treesEqual(engine.parse(spliced, options.parse), engine.parse(full, options.parse)) ? spliced : full;
}
