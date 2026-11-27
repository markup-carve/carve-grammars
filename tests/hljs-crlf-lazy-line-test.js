/**
 * highlight.js: a CRLF document reads the lazy lines of C2-B-024 as its LF
 * copy does (carve-grammars#995). The check for paragraph text above stepped
 * back to a point between the CR and the LF and read an empty line there.
 */
import assert from 'node:assert/strict';

import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

hljs.registerLanguage('carve', carve);
const hl = (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true }).value;

const inputs = [
    'a\n%% c\n{#m}',
    'a\n%% c\n{.c}',
    'a\n%% c\n{{ a.crv }}',
    'a\n%% c\n> q',
    'a\n%% c\n%% d\n{#m}\nb',
];
for (const source of inputs) {
    const lf = hl(source);
    assert.doesNotMatch(lf, /hljs-(?:attr|meta|quote)/, JSON.stringify(source));
    assert.equal(hl(source.replaceAll('\n', '\r\n')), lf.replaceAll('\n', '\r\n'), JSON.stringify(source.replaceAll('\n', '\r\n')));
}
console.log(`highlight.js CRLF lazy lines: ${inputs.length} inputs read as their LF copy`);
