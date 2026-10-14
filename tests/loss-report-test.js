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
import { astToProseMirror, carveToProseMirror, carveToProseMirrorWithReport } from '../tiptap/index.js';

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

ok('abbreviations and their definitions are fully editable', () => {
    const source = '*[HTML]: Hyper Text Markup Language\n\nA [HTML]{abbr="Custom"} span.\n';
    const { doc, preserved } = carveToProseMirrorWithReport(source, { unsupported: 'preserve' });
    assert.deepStrictEqual(preserved, {});
    assert.strictEqual(doc.content[0].type, 'carveAbbreviationDefinition');
    assert.ok(doc.content[1].content.some((node) =>
        node.marks?.some((mark) => mark.type === 'carveAbbreviation')));
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

ok('cell joins keep their space, except at the start of a cell', () => {
    const report = {};
    const cell = (children) => ({ type: 'table_cell', children });
    const doc = astToProseMirror({ type: 'document', children: [{ type: 'table', rows: [
        { cells: [
            cell([{ type: 'text', value: 'a' }, { type: 'cell_wrap' }, { type: 'text', value: 'x' }]),
            cell([{ type: 'cell_wrap' }, { type: 'text', value: 'y' }]),
        ] },
    ] }] }, { report });
    const cells = doc.content[0].content[0].content;
    assert.deepStrictEqual(cells[0].content[0].content, [{ type: 'text', text: 'a x' }]);
    assert.deepStrictEqual(cells[1].content[0].content, [{ type: 'text', text: 'y' }]);
    assert.strictEqual(report.degraded.cell_wrap,
        'a continuation join is the space it replaced in the ProseMirror model');
});

ok('inline payload offsets are reported without changing their values', () => {
    const report = {};
    const children = ['code', 'raw_inline', 'math'].map((type) => ({
        type, value: 'a b', content: 'a b', format: 'html', cellWraps: [{ offset: 1, line: 2 }],
    }));
    const doc = astToProseMirror({ type: 'document', children: [{ type: 'paragraph', children }] }, { report });
    assert.strictEqual(doc.content[0].content[0].text, 'a b');
    assert.strictEqual(doc.content[0].content[1].content[0].text, 'a b');
    assert.strictEqual(doc.content[0].content[2].attrs.src, 'a b');
    assert.ok('cell_wrap' in report.degraded);
});

ok('a merge-backed source envelope is reported', () => {
    // The rich projection stays editable while its authored spelling is used
    // as the merge branch for later serialization.
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
