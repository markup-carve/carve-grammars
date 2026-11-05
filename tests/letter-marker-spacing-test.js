// carve#4828: a letter or roman list marker with a dot needs two spaces after it.
import assert from 'node:assert/strict';
import { parse, renderHtml } from '@markup-carve/carve';
import { carveToProseMirror } from '../tiptap/carve-to-pm.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const html = (source) => renderHtml(parse(source));
const CASES = [
    ['a.  alpha\nb.  beta\n', 'a.  alpha\nb.  beta'],
    ['A.  one\nB.  two\n', 'A.  one\nB.  two'],
    ['i.  one\nii.  two\n', 'i.  one\nii.  two'],
    ['a.  alpha\n\n    para\n', 'a.  alpha\n\n    para'],
    ['a) x\n', 'a) x'],
    ['1. x\n', '1. x'],
    ['a. alpha\n', 'a. alpha'],
    ['x\n\nI. text\n', 'x\n\nI. text'],
];
let passed = 0;
console.log('letter and roman marker spacing:');
for (const [source, expected] of CASES) {
    const written = serializeToCarve(carveToProseMirror(source));
    assert.equal(written, expected, JSON.stringify(source));
    assert.equal(html(written), html(source), `${JSON.stringify(source)} changed meaning`);
    passed++;
    console.log(`  ✓ ${JSON.stringify(source)}`);
}
console.log(`${passed} passed`);
