/**
 * A span marker's own alignment survives when the marker stays a cell, and is
 * reported when it merges into a span (carve-grammars#862).
 */
import assert from 'node:assert';
import { carveToHtml } from '@markup-carve/carve';
import { carveToProseMirrorWithReport, serializeToCarve } from '../tiptap/index.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const MERGED = "a span marker's own content, alignment, attributes or header flag have no slot once it merges into a colspan or rowspan";
const cellsOf = (doc) => doc.content[0].content.map((row) => row.content);

console.log('span marker own alignment:');

ok('a blocked marker keeps its alignment and writes it back', () => {
    const source = '|={>} ^ |={>} b |\n| c | d |\n';
    const { doc, degraded } = carveToProseMirrorWithReport(source);
    assert.deepStrictEqual(cellsOf(doc)[0][0].attrs, { carveSpanMarker: '^', textAlign: 'right' });
    assert.deepStrictEqual(degraded, {});
    assert.strictEqual(carveToHtml(serializeToCarve(doc)), carveToHtml(source));
});

ok('a blocked marker keeps its vertical alignment', () => {
    const source = '|{<^} < | b |\n';
    const { doc, degraded } = carveToProseMirrorWithReport(source);
    assert.deepStrictEqual(cellsOf(doc)[0][0].attrs, { carveSpanMarker: '<', textAlign: 'left', carveVerticalAlign: 'top' });
    assert.deepStrictEqual(degraded, {});
    assert.strictEqual(carveToHtml(serializeToCarve(doc)), carveToHtml(source));
});

for (const [name, source] of [
    ['a merged colspan marker with its own alignment', '|={>} Price |{<} < |={~} Stock |\n| 12.50 | EUR | 3 |\n'],
    ['a merged rowspan marker with its own alignment', '| a | b |\n|{>} ^ | c |\n'],
    ['a merged header marker', '|= a |= < |\n| b | c |\n'],
]) {
    ok(`${name} is reported`, () => {
        assert.strictEqual(carveToProseMirrorWithReport(source).degraded.table_cell, MERGED);
    });
}

ok('a plain merged marker reports nothing', () => {
    assert.deepStrictEqual(carveToProseMirrorWithReport('| a | < |\n| ^ | ^ |\n').degraded, {});
});

console.log(`${passed} passed, 0 failed`);
