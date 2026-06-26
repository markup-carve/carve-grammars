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
// serialize/reparse cycle. `order` is carve-js's record of the textual order in
// which `.class`/`#id` attribute tokens appeared; the serializer emits a
// canonical `#id .class` order, so the *set* of attributes is what matters, not
// their original spelling order. `srcByteLength` records the byte size of the
// source string, which legitimately differs between the original and the
// re-serialized form even when the document structure is identical.
const VOLATILE_KEYS = new Set([
    'pos',
    'startLine', 'endLine', 'startColumn', 'endColumn', 'startOffset', 'endOffset',
    'line', 'column', 'offset',
    'order',
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
