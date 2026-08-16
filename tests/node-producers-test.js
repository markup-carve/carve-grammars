/**
 * Every node the map declares is not only NAMED by the converter but actually
 * built from real Carve source, and comes back spelled the way it was written.
 *
 * `schema-map-test.js` proves reachability by reading the converter's source,
 * which is a string scan: it can say the name appears, never that a document
 * holding the construct produces it. This drives each construct end to end -
 * source, the node, and the source again - so a producer that is present but
 * wrong fails here rather than passing both gates.
 */
import assert from 'node:assert';
import { citations, parse } from '@markup-carve/carve';
import { carveToProseMirror } from '../tiptap/index.js';
import { astToProseMirror } from '../tiptap/carve-to-pm.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { normalizeAst } from './lib/ast-normalize.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

/** Find the first node of `type` anywhere in a ProseMirror document. */
function find(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of node.content || []) {
        const hit = find(child, type);
        if (hit) return hit;
    }

    return null;
}

/**
 * @param {string} source - Carve source.
 * @param {string} pmType - The ProseMirror node the source must produce.
 * @param {object} [options] - Loader options (`parse` reaches the engine).
 */
function producesAndRoundTrips(source, pmType, options = {}) {
    // `throw`, deliberately: `preserve` would hide a missing producer behind an
    // opaque atom, which is exactly the failure this file exists to catch.
    const doc = carveToProseMirror(source, { ...options, unsupported: 'throw' });
    const node = find(doc, pmType);
    assert.ok(node, `${pmType} was not produced for ${JSON.stringify(source)}`);

    // Strip the source envelope: with it, the serializer replays the stored
    // source and would pass for any node shape at all.
    const written = serializeToCarve({ ...doc, attrs: undefined });
    assert.deepStrictEqual(
        normalizeAst(parse(written, options.parse)),
        normalizeAst(parse(source, options.parse)),
        `${pmType} round trip: ${JSON.stringify(source)} -> ${JSON.stringify(written)}`,
    );

    return node;
}

console.log('node producers:');

ok('symbol -> carveSymbol', () => {
    const node = producesAndRoundTrips('A :rocket: flies.\n', 'carveSymbol');
    assert.strictEqual(node.attrs.name, 'rocket');
});

ok('literal_inline -> carveLiteral', () => {
    const node = producesAndRoundTrips('Say !`/kaet/` now.\n', 'carveLiteral');
    assert.strictEqual(node.attrs.content, '/kaet/');
});

ok('substitution -> carveSubstitution', () => {
    const node = producesAndRoundTrips('A {~old~>new~} word.\n', 'carveSubstitution');
    assert.strictEqual(node.attrs.oldText, 'old');
    assert.strictEqual(node.attrs.newText, 'new');
});

ok('raw_inline -> carveRawInline', () => {
    const node = producesAndRoundTrips('A `<br>`{=html} break.\n', 'carveRawInline');
    assert.deepStrictEqual([node.attrs.format, node.attrs.content], ['html', '<br>']);
});

ok('inline_extension -> carveInlineExtension', () => {
    const node = producesAndRoundTrips('Press :kbd[Ctrl+C] now.\n', 'carveInlineExtension');
    assert.strictEqual(node.attrs.name, 'kbd');
    assert.deepStrictEqual(node.content, [{ type: 'text', text: 'Ctrl+C' }]);
});

ok('heading_ref -> carveCrossref', () => {
    const node = producesAndRoundTrips('# Getting Started\n\nSee </#getting-started>.\n', 'carveCrossref');
    assert.strictEqual(node.attrs.target, 'getting-started');
});

ok('inline_footnote -> carveInlineNote with EDITABLE content', () => {
    const node = producesAndRoundTrips('A note^[see *later*] inline.\n', 'carveInlineNote');
    // The body is inline content, not a source blob: an editor can put a cursor
    // in it. Carrying it as a `carveFootnote` atom stamped with `carveSource`
    // round-tripped just as well and was not editable at all.
    assert.strictEqual(node.content[0].text, 'see ');
    assert.deepStrictEqual(node.content[1].marks, [{ type: 'bold' }]);
});

ok('link_reference_definition -> carveLinkRefDef, written where it stands', () => {
    const source = 'Read the [introduction][intro] first.\n\n[intro]: https://example.com/intro "Introduction"\n';
    const node = producesAndRoundTrips(source, 'carveLinkRefDef');
    assert.strictEqual(node.attrs.label, 'intro');
    assert.strictEqual(node.attrs.href, 'https://example.com/intro');
    assert.strictEqual(node.attrs.title, 'Introduction');

    // Exactly ONE definition line: the node writes it, so the collector that
    // re-derives definitions from the references resolving them must not append
    // a second copy.
    const written = serializeToCarve({ ...carveToProseMirror(source, { unsupported: 'throw' }), attrs: undefined });
    assert.strictEqual((written.match(/^\[intro\]:/gm) || []).length, 1, written);
});

ok('a definition keeps its own trailing attribute run', () => {
    const node = producesAndRoundTrips(
        '[Example][ex] and [again][ex]\n\n[ex]: https://example.com {.external}\n',
        'carveLinkRefDef',
    );
    assert.strictEqual(node.attrs.class, 'external');
});

ok('frontmatter -> carveFrontmatter, verbatim', () => {
    const node = producesAndRoundTrips('---\ntitle: My Document\n---\n\nBody.\n', 'carveFrontmatter');
    assert.deepStrictEqual(node.attrs, { format: 'yaml', content: 'title: My Document' });
});

ok('citation_group -> carveCitation, items and all', () => {
    // The loader has to reach the ENGINE with the extension: `parse()` does not
    // emit a citation group unless it is told to, so the mapping for one could
    // not be exercised while the loader parsed with no options at all.
    const source = 'A [@a2020, p. 3; see @b2021] and [+@c2019] end.\n\n[@a2020]: {} A.\n[@b2021]: {} B.\n[@c2019]: {} C.\n';
    const options = { parse: { extensions: [citations()] } };
    const node = producesAndRoundTrips(source, 'carveCitation', options);
    assert.strictEqual(node.attrs.raw, '[@a2020, p. 3; see @b2021]');
    assert.strictEqual(node.attrs.integral, false);
    assert.strictEqual(node.attrs.items.length, 2);
    assert.strictEqual(node.attrs.items[0].key, 'a2020');
    // Prefix, locator and suffix are INLINE arrays, as the map says.
    assert.deepStrictEqual(node.attrs.items[0].locator, [{ type: 'text', text: 'p. 3' }]);
    assert.deepStrictEqual(node.attrs.items[1].prefix, [{ type: 'text', text: 'see' }]);

    const doc = carveToProseMirror(source, { ...options, unsupported: 'throw' });
    const integral = doc.content[0].content.filter((child) => child.type === 'carveCitation')[1];
    assert.strictEqual(integral.attrs.integral, true);
});

ok('section -> carveSection, children hoisted through it', () => {
    // No Carve source opens a section - it is a rendering wrapper - so this one
    // is driven from an AST, the way one arrives from another engine's
    // `ast-json` or from a patch.
    const ast = {
        type: 'document',
        children: [{
            type: 'section',
            children: [
                { type: 'heading', level: 1, children: [{ type: 'text', value: 'H' }] },
                { type: 'paragraph', children: [{ type: 'text', value: 'body' }] },
            ],
        }],
    };
    const doc = astToProseMirror(ast, { unsupported: 'throw' });
    assert.strictEqual(doc.content[0].type, 'carveSection');
    assert.deepStrictEqual(doc.content[0].content.map((n) => n.type), ['heading', 'paragraph']);
    assert.strictEqual(serializeToCarve(doc), '# H\n\nbody');
});

ok('an authored attribute run survives on every construct that takes one', () => {
    for (const [source, pmType, expected] of [
        ['Launch :rocket:{.big} now.\n', 'carveSymbol', 'big'],
        ['!`/kaet/`{.ipa} is IPA.\n', 'carveLiteral', 'ipa'],
        [':widget[x]{.w} here.\n', 'carveInlineExtension', 'w'],
        ['# h\n\na ^[</#h>]{.c} b\n', 'carveInlineNote', 'c'],
    ]) {
        const node = producesAndRoundTrips(source, pmType);
        assert.strictEqual(node.attrs?.class, expected, `${pmType} lost its class`);
    }
});

ok('an inline atom inside a mark keeps the mark', () => {
    // The atom carries the mark like any other inline node, but only the text
    // path writes a mark's delimiters, so `*:rocket:*` came back as `:rocket:` -
    // the emphasis dropped without a trace.
    for (const source of [
        'A *:rocket:* here.\n',
        'A /!`x`/ here.\n',
        'A *^[note]* here.\n',
        'A *@alice* here.\n',
    ]) {
        const doc = carveToProseMirror(source, { unsupported: 'throw' });
        assert.strictEqual(serializeToCarve({ ...doc, attrs: undefined }), source.trimEnd(), source);
    }
});

ok('an inline atom inside a link stays inside the label', () => {
    // The link mark rides on the atom like any other inline node, but only the
    // text path knows how to open and close a bracket label - so
    // `[see </#H>](/outer)` came back as `[see ](/outer)</#H>`, moving the atom
    // out of the link entirely.
    producesAndRoundTrips('# H\n\n[see </#H>](/outer)\n', 'carveCrossref');
    producesAndRoundTrips('# a !`Cat` b\n\n[a !`Cat` b][]\n', 'carveLiteral');
});

console.log(`\n${passed} passed`);
