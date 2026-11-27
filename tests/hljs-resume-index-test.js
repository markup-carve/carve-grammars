/**
 * highlight.js: a resume after a full-matcher fallback starts after the rule
 * that matched, counted from rule 0 (carve-grammars#994). Two refused begins
 * in a row on different positions once skipped rules at the second one.
 */
import assert from 'node:assert/strict';

import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

hljs.registerLanguage('carve', carve);
const hl = (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true }).value;

// [input, expected, line endings]
const cases = [
    // A refused link, then a definition refused under the paragraph line: the
    // footnote reference rule still reads `[^n]`, as it does without the `_`.
    ['_\n[\n[^n]: x', '_\n[\n<span class="hljs-symbol">[^n]</span>: x', ['\n', '\r\n']],
    ['x _\n[\n[^n]: x', 'x _\n[\n<span class="hljs-symbol">[^n]</span>: x', ['\n', '\r\n']],
    // The attribute rules still refuse `{#m}` inside the paragraph, so the tag
    // rule does not claim `#m`.
    ['{\n%% c\n{{ a.crv }}  \n{#m}\nthree', '{\n<span class="hljs-comment">%% c</span>\n{{ a.crv }}  \n{#m}\nthree', ['\n']],
];
let checked = 0;
for (const [source, expected, endings] of cases) {
    for (const eol of endings) {
        assert.equal(hl(source.replaceAll('\n', eol)), expected.replaceAll('\n', eol), JSON.stringify(source.replaceAll('\n', eol)));
        checked++;
    }
}
// The same lines without the earlier refusal read the same way.
assert.equal(hl('a\n[^n]: x'), 'a\n<span class="hljs-symbol">[^n]</span>: x');
assert.equal(hl('a\n{#m}\nthree'), 'a\n{#m}\nthree');
console.log(`highlight.js resume index: ${checked + 2} inputs read the same with and without an earlier refusal`);
