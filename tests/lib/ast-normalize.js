/**
 * Normalize a carve-js AST into a position-free, canonical structure so two
 * parses can be compared for round-trip idempotence with a plain deepEqual.
 *
 * The reference parser annotates every node with a `pos` (line/column/offset)
 * span. Those coordinates legitimately differ between the original source and
 * the re-serialized source even when the document structure is identical, so we
 * strip every positional field. We also drop empty `children`/`items`/`cells`
 * arrays so that "no children" and "absent children" compare equal, and sort
 * object keys for a stable shape.
 */

// Keys that carry source coordinates or are otherwise volatile across a
// serialize/reparse cycle. `srcByteLength` records the byte size of the source
// string, which legitimately differs between the original and the re-serialized
// form even when the document structure is identical.
//
// `order` USED TO BE HERE. It is carve-js's record of the textual order in which
// an attribute run's `#id`/`.class`/`key` tokens appeared, and the excuse for
// stripping it was that the serializer emits a canonical order anyway, so only
// the SET of attributes matters. That is the shape of every silent loss: the
// gate stopped measuring the one thing the bridge was dropping, so
// `{key=c .a #b}` returning `{#b .a key="c"}` could not fail here. The wire
// carries the order now (markup-carve/carve-grammars#240), so the check measures
// it (see tiptap/extensions/carve-attribute-slots.js).
const VOLATILE_KEYS = new Set([
    'pos',
    'startLine', 'endLine', 'startColumn', 'endColumn', 'startOffset', 'endOffset',
    'line', 'column', 'offset',
    'srcByteLength',
]);

const EMPTY_ARRAY_KEYS = new Set(['children', 'items', 'cells', 'rows']);

export function normalizeAst(node) {
    if (Array.isArray(node)) {
        return node.map(normalizeAst);
    }
    if (node === null || typeof node !== 'object') {
        return node;
    }

    const out = {};
    for (const key of Object.keys(node).sort()) {
        if (VOLATILE_KEYS.has(key)) continue;
        const value = node[key];
        if (EMPTY_ARRAY_KEYS.has(key) && Array.isArray(value) && value.length === 0) {
            continue;
        }
        out[key] = normalizeAst(value);
    }
    return out;
}
