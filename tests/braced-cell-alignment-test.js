// carve#5091 D3: alignment symbols lead a table cell's attribute block.
import assert from 'node:assert/strict';
import { parse } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { carveToProseMirror } from '../tiptap/carve-to-pm.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const ALIGNED = [
    ['|={>} Qty |= Name |\n', '>'],
    ['|{> .num} 12.50 |\n', '>'],
    ['|{<} x |\n', '<'],
    ['|{?v} y |\n', '?v'],
    ['|={>^} T |\n', '>^'],
    ['|={~ #score} S |\n', '~'],
    ['|{~~} z |\n', '~~'],
    ['|{> k="a\\"b"} x |\n', '>'],
];

const alignmentText = (tokens, has) => tokens.filter(has).map((t) => t.text).join('');

console.log('braced cell alignment:');
for (const [source, symbols] of ALIGNED) {
    ok(JSON.stringify(source), () => {
        const cell = parse(source).children[0].rows[0].cells[0];
        assert.ok(cell.align || cell.valign, `engine reads no alignment in ${JSON.stringify(source)}`);
        assert.equal(alignmentText(prismTokens(source), (t) => /table-alignment/.test(t.scope ?? '')), symbols, 'prism');
        assert.equal(alignmentText(hljsTokens(source), (t) => t.scope === 'table-alignment'), symbols, 'highlight.js');
        assert.ok(textmate(source).some((t) => (t.scope ?? '').includes('keyword.operator.table.alignment') && t.text.includes(symbols[0])), 'textmate');
    });
}

ok('braced strikethrough in a cell stays strikethrough', () => {
    const source = '|{~ x ~} y |\n';
    assert.ok(!prismTokens(source).some((t) => /table-alignment/.test(t.scope ?? '')), 'prism');
    assert.ok(!hljsTokens(source).some((t) => t.scope === 'table-alignment'), 'highlight.js');
});

ok('the editor writes alignment inside the braces', () => {
    const doc = carveToProseMirror('|=> Qty |= N |\n|<^ 1 |{.c} a |\n');
    assert.equal(serializeToCarve(doc), '|={>} Qty |= N |\n|{<^} 1 |{.c} a |');
    const merged = carveToProseMirror('|={~ .c} N |\n| 1 |\n');
    assert.equal(serializeToCarve(merged), '|={~ .c} N |\n| 1 |');
});

console.log(`${passed} passed`);
