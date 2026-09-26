/**
 * The four types Carve 0.1 source does not spell, driven end to end.
 *
 * `directive`, `block_extension`, `ruby` and `small_caps` reach the editor over
 * the AST-JSON wire only, so `node-producers-test.js` - which starts from Carve
 * source - cannot exercise them. Without this file their entries in
 * `schema-map.json` would rest on a string scan of the converter, which says a
 * name appears and never that a document holding the type produces it.
 *
 * Each case asserts three things a naming alone does not give: the node the map
 * declares is built, its attributes carry what the AST carried, and the
 * serializer writes the degradation the spec prescribes rather than dropping the
 * construct in silence (markup-carve/carve-grammars#561).
 */
import assert from 'node:assert';
import { astToProseMirror } from '../tiptap/carve-to-pm.js';
import { serializeToCarve, serializeToCarveWithReport } from '../tiptap/serializer.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

/** Wrap block nodes in a document, the way one arrives from an ast-json ingest. */
function doc(...children) {
    return astToProseMirror({ type: 'document', children }, { unsupported: 'throw' });
}

/** One paragraph holding the given inline nodes. */
function para(...children) {
    return { type: 'paragraph', children };
}

function text(value) {
    return { type: 'text', value };
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

console.log('interchange-only nodes:');

ok('this file is part of the suite npm test runs', () => {
    assertThisFileRuns(import.meta.url);
});

ok('directive -> carveDirective, kind on the node', () => {
    const pm = doc({ type: 'directive', kind: 'toc', children: [] });
    const node = find(pm, 'carveDirective');
    assert.ok(node, 'no carveDirective was produced');
    assert.strictEqual(node.attrs.kind, 'toc');
    // The whole reason it is not an alias of `div`: the TYPE is on the wire, so
    // a bridge reading it back needs no copy of the six-kind enum.
    assert.strictEqual(find(pm, 'carveDiv'), null, 'a directive must not arrive as a carveDiv');
    assert.strictEqual(serializeToCarve(pm), '::: toc\n:::');
});

ok('a directive keeps its title, label, id, classes and key/values', () => {
    const pm = doc({
        type: 'directive',
        kind: 'bibliography',
        title: [text('Works Cited')],
        label: 'refs',
        attrs: { id: 'bib', classes: ['tight'], keyValues: { start: '2' }, order: ['#id', '.class', 'start'] },
        children: [],
    });
    const node = find(pm, 'carveDirective');
    assert.strictEqual(node.attrs.title, 'Works Cited');
    assert.strictEqual(node.attrs.label, 'refs');
    assert.strictEqual(node.attrs.id, 'bib');
    assert.strictEqual(node.attrs.class, 'tight');
    assert.deepStrictEqual(node.attrs.carveKeyValues, { start: '2' });

    const written = serializeToCarve(pm);
    // The kind word goes on the opener; everything the opener cannot carry goes
    // on the attribute line above it, exactly as a typed container's does.
    assert.match(written, /^\{#bib \.tight start="2"\}\n/);
    assert.match(written, /^::: bibliography "Works Cited" \[refs\]$/m);
    assert.ok(!written.includes('kind='), `the kind must not reach the attribute run: ${written}`);
});

ok("a directive's blocks are carried, not dropped", () => {
    const pm = doc({ type: 'directive', kind: 'footnotes', children: [para(text('Fallback prose.'))] });
    const node = find(pm, 'carveDirective');
    assert.deepStrictEqual(node.content.map((child) => child.type), ['paragraph']);
    assert.strictEqual(serializeToCarve(pm), '::: footnotes\nFallback prose.\n:::');
});

ok('block_extension -> carveBlockExtension, the fallback as CONTENT', () => {
    const pm = doc({
        type: 'block_extension',
        name: 'org.example.diagram',
        version: '2',
        payload: { format: 'application/json', value: { nodes: 2 } },
        fallback: para(text('A diagram of two nodes.')),
    });
    const node = find(pm, 'carveBlockExtension');
    assert.ok(node, 'no carveBlockExtension was produced');
    assert.strictEqual(node.attrs.name, 'org.example.diagram');
    assert.strictEqual(node.attrs.version, '2');
    assert.deepStrictEqual(node.attrs.payload, { format: 'application/json', value: { nodes: 2 } });
    // The fallback is a real editable block, not a blob on an attribute.
    assert.deepStrictEqual(node.content.map((child) => child.type), ['paragraph']);
});

ok('a block extension writes its fallback and REPORTS the substitution', () => {
    const pm = doc({
        type: 'block_extension',
        name: 'org.example.query',
        fallback: para(text('The five most recent posts.')),
    });
    const { source, degraded } = serializeToCarveWithReport(pm);
    assert.strictEqual(source, 'The five most recent posts.');
    // CARVE-P12-055: the fallback stands in, and the loss is stated. A
    // silent substitution is the failure mode the required fallback exists to
    // make impossible.
    assert.ok(degraded.block_extension, `no degradation reported: ${JSON.stringify(degraded)}`);
});

ok('ruby -> carveRuby, pairs as inline arrays', () => {
    const pm = doc(para({
        type: 'ruby',
        pairs: [
            { base: [text('漢')], annotation: [text('kan')] },
            { base: [text('字')], annotation: [text('ji')] },
        ],
    }));
    const node = find(pm, 'carveRuby');
    assert.ok(node, 'no carveRuby was produced');
    assert.strictEqual(node.attrs.pairs.length, 2);
    assert.deepStrictEqual(node.attrs.pairs[0].base, [{ type: 'text', text: '漢' }]);
    assert.deepStrictEqual(node.attrs.pairs[1].annotation, [{ type: 'text', text: 'ji' }]);
});

ok('a ruby flattens to base(annotation) in pair order, and says so', () => {
    const pm = doc(para({
        type: 'ruby',
        pairs: [
            { base: [text('漢')], annotation: [text('kan')] },
            { base: [text('字')], annotation: [] },
        ],
    }));
    const { source, degraded } = serializeToCarveWithReport(pm);
    // CARVE-P12-054: an EMPTY annotation stays visible as `()`. Writing `字`
    // bare would lose the fact that a half was there and empty.
    assert.strictEqual(source, '漢(kan)字()');
    assert.ok(degraded.ruby, `no degradation reported: ${JSON.stringify(degraded)}`);
});

ok("a ruby's own attribute run wraps the WHOLE fallback in one span", () => {
    const pm = doc(para({
        type: 'ruby',
        pairs: [{ base: [text('a')], annotation: [text('b')] }],
        attrs: { classes: ['furigana'] },
    }));
    assert.strictEqual(serializeToCarve(pm), '[a(b)]{.furigana}');
});

ok('small_caps -> the carveSmallCaps mark, children editable', () => {
    const pm = doc(para({ type: 'small_caps', children: [text('nasa')] }));
    const paragraph = pm.content[0];
    assert.deepStrictEqual(paragraph.content, [{
        type: 'text', text: 'nasa', marks: [{ type: 'carveSmallCaps' }],
    }]);
});

ok('small caps write their children unchanged, and say what was lost', () => {
    const pm = doc(para({ type: 'small_caps', children: [text('nasa')] }));
    const { source, degraded } = serializeToCarveWithReport(pm);
    // CARVE-P12-050: the letter case is NOT changed and no source syntax is
    // invented.
    assert.strictEqual(source, 'nasa');
    assert.ok(degraded.small_caps, `no degradation reported: ${JSON.stringify(degraded)}`);
});

ok("small caps keep their attribute run on an ordinary span", () => {
    const pm = doc(para({
        type: 'small_caps',
        children: [text('nasa')],
        attrs: { id: 'agency', classes: ['org'] },
    }));
    const marks = pm.content[0].content[0].marks.map((mark) => mark.type);
    assert.ok(marks.includes('carveSpan'), `the run needs a span to ride: ${marks.join(', ')}`);
    assert.strictEqual(serializeToCarve(pm), '[nasa]{#agency .org}');
});

ok('a small-caps wrapper with no children is reported, not silently gone', () => {
    const pm = doc(para({ type: 'small_caps', children: [] }));
    const { dropped } = serializeToCarveWithReport(pm);
    // Nothing can be written: no source spelling, and no children to fall back
    // to. That is the one state where the answer is a report and nothing else.
    assert.ok(dropped.small_caps, `no drop reported: ${JSON.stringify(dropped)}`);
});

ok('small caps inside an attributed span report the run that cannot be written', () => {
    const pm = doc(para({
        type: 'span',
        attrs: { id: 'outer' },
        children: [{ type: 'small_caps', attrs: { id: 'inner' }, children: [text('word')] }],
    }));
    const { source, dropped } = serializeToCarveWithReport(pm);
    // Only the OUTERMOST run has a spelling here, which is what two nested
    // attributed spans have always done. Saying so is the new part.
    assert.strictEqual(source, '[word]{#outer}');
    assert.ok(dropped.span, `the inner run was dropped in silence: ${JSON.stringify(dropped)}`);
});

ok('a mark nests around small caps rather than replacing it', () => {
    const pm = doc(para({
        type: 'strong',
        children: [{ type: 'small_caps', children: [text('nasa')] }],
    }));
    const marks = pm.content[0].content[0].marks.map((mark) => mark.type).sort();
    assert.deepStrictEqual(marks, ['bold', 'carveSmallCaps']);
    assert.strictEqual(serializeToCarve(pm), '*nasa*');
});


ok('a generated space survives as text and keeps inherited marks', () => {
    const report = {};
    const pm = astToProseMirror({ type: 'document', children: [para({ type: 'strong', children: [{ type: 'non_breaking_space' }] })] }, { report });
    assert.ok(report.degraded.non_breaking_space);
    assert.deepStrictEqual(pm.content[0].content, [{ type: 'text', text: '\u00a0', marks: [{ type: 'bold' }] }]);
});

console.log(`\n${passed} passed`);
