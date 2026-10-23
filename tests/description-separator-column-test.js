/**
 * A `:` description separator continues a definition list only at the column
 * of a term above it (markup-carve/carve#3458). Below or right of that column
 * it is paragraph or description text, so Prism and highlight.js must not
 * scope it as the marker. Each shape is checked against carve-js too. Prism
 * reads a term that starts its text as a fragment after a list marker, so the
 * TEXT shapes open below a paragraph.
 */
import assert from 'node:assert/strict';

import { parse, renderHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const ENGINES = {
    prism: { tokenize: prismTokens, marks: (scope) => scope.endsWith('punctuation') },
    highlightjs: { tokenize: hljsTokens, marks: (scope) => scope === 'punctuation' },
};

const MARKER = [
    ':: t\n: d\n: e\n',
    ':: t\n: d\n\n: e\n',
    ':: t\n: d\n  :: u\n  : v\n: e\n',
    '- x\n  :: t\n  : d\n  : e\n',
    '- x\n  :: t\n  : d\n\n  : e\n',
    ':: t\n:  :: u\n   : e\n',
    `:: t\n${'x\n'.repeat(70)}: e\n`,
];
const TEXT = [
    '- x\n  :: t\n  : d\n: e\n',
    '- x\n  :: t\n  : d\n : e\n',
    '- x\n  :: t\n  : d\n   : e\n',
    '- x\n  :: t\n  : d\n  x\n : e\n',
    'x\n\n:: t\n: d\n  : e\n',
    'x\n\n:: t\n  : d\n',
];

const scopeAt = (tokens, at) => {
    let offset = 0;
    for (const token of tokens) {
        if (at >= offset && at < offset + token.text.length) return token.scope ?? '';
        offset += token.text.length;
    }
    return '';
};

let failures = 0;
const check = (source, marker) => {
    const colon = source.lastIndexOf(':');
    const html = renderHtml(parse(source)).replace(/\n */g, '');
    const last = source.slice(colon + 1).trim();
    const engineMarker = new RegExp(`<dd>(<p>)?${last}(</p>)?</dd>`).test(html);
    if (engineMarker !== marker) {
        failures++;
        console.error(`carve-js: ${JSON.stringify(source)} reads the last : as ${engineMarker ? 'a marker' : 'text'}`);
    }
    for (const [name, { tokenize, marks }] of Object.entries(ENGINES)) {
        const scoped = marks(scopeAt(tokenize(source), colon));
        if (scoped !== marker) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - the last : is ${scoped ? '' : 'not '}scoped as a marker`);
        }
    }
};
for (const source of MARKER) check(source, true);
for (const source of TEXT) check(source, false);

assert.equal(failures, 0, `${failures} shape(s) disagree`);
console.log(`description separator column: ${MARKER.length + TEXT.length} shapes agree with carve-js in prism and highlight.js`);
