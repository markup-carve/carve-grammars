/**
 * The bridge REPORTS what the editor model could not hold.
 *
 * docs/format-bridges.md states it as the contract every bridge owes its
 * caller: an application storing documents has to be able to refuse one that
 * lost something. carve-php has exposed `droppedTypes()`/`degradedTypes()`
 * since it had a bridge at all. This one reported nothing at all - a construct
 * with no editable node arrived as an opaque atom holding its source, which is
 * the right behavior and was completely silent, so no application could tell a
 * fully editable document from one carrying blobs of unparsed source.
 */
import assert from 'node:assert';
import { carveToProseMirror, carveToProseMirrorWithReport } from '../tiptap/index.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('loss report:');

ok('a fully editable document reports nothing', () => {
    const { preserved, degraded } = carveToProseMirrorWithReport(
        '# Title\n\nSome *bold* text with a [link](/u).\n',
        { unsupported: 'preserve' },
    );
    assert.deepStrictEqual(preserved, {});
    assert.deepStrictEqual(degraded, {});
});

ok('a preserved construct names its own type', () => {
    // Was `smart_punctuation`, which the bridge models now - a typographic
    // quote is text and reports as degraded rather than preserved. An
    // abbreviation span is still carried whole, so it is the example here.
    const source = '*[HTML]: Hyper Text Markup Language\n\nA [HTML]{abbr="Custom"} span.\n';
    const { doc, preserved } = carveToProseMirrorWithReport(source, { unsupported: 'preserve' });
    assert.ok('abbreviation' in preserved, JSON.stringify(preserved));

    // And the atom itself carries the type, not only the source: a caller
    // walking the document can point at the construct that is not editable.
    const find = (node) => (node.type === 'carveUnsupportedInline'
        ? node
        : (node.content || []).map(find).find(Boolean));
    const atom = doc.content.map(find).find(Boolean);
    assert.strictEqual(atom.attrs.carveType, 'abbreviation');
    assert.ok(atom.attrs.carveSource);
});

ok('a degraded construct is reported apart from a preserved one', () => {
    const { preserved, degraded } = carveToProseMirrorWithReport('one\ntwo\n', { unsupported: 'preserve' });
    assert.deepStrictEqual(Object.keys(degraded), ['soft_break']);
    assert.deepStrictEqual(preserved, {});
});

ok('an escape is degraded, not silently normal text', () => {
    const { degraded } = carveToProseMirrorWithReport('a \\* b\n', { unsupported: 'preserve' });
    assert.ok('escaped_text' in degraded, JSON.stringify(degraded));
});

ok('the whole-document envelope is reported', () => {
    // The rich projection is kept but is not write-identical, so the source
    // rides along and the FIRST EDIT is what starts writing the projection.
    // Silent, that is the worst case in the file: the document looks editable
    // and changes the moment it is edited.
    const { preserved } = carveToProseMirrorWithReport('a \\* b\n', { unsupported: 'preserve' });
    assert.ok('document' in preserved, JSON.stringify(preserved));
});

ok('the report is opt-in and changes nothing about the document', () => {
    const source = 'It is "smart" and\nwrapped.\n';
    const plain = carveToProseMirror(source, { unsupported: 'preserve' });
    const { doc } = carveToProseMirrorWithReport(source, { unsupported: 'preserve' });
    assert.deepStrictEqual(doc, plain);
});

console.log(`\n${passed} passed`);
