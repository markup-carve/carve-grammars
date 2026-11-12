/**
 * A `+` alone on a quote's first line is the first-block marker whatever
 * follows it (spec corpus 647 and the 0.1.14 layout readings): only a quote
 * line of the same depth above makes it paragraph text. Prism and highlight.js
 * scope that `+` as the marker. Each shape is checked against carve-js too.
 */
import assert from 'node:assert/strict';

import { parse, renderHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const ENGINES = {
    prism: { tokenize: prismTokens, marks: (scope) => scope.includes('continuation-marker') },
    highlightjs: { tokenize: hljsTokens, marks: (scope) => scope === 'punctuation' },
};

const MARKER = [
    '- a\n  > +\nb\n',
    '- a\n  > +\n  b\n',
    '- a\n  > +\n  # h\n',
    '- a\n  > > +\n  b\n',
    '1. a\n   > +\n   b\n',
    '- a\n  - b\n    > +\n    b\n',
    '- a\n  c\n  > +\n  b\n',
    '- a\n\n  > +\n  b\n',
    '- a\n    > +\n    b\n',
    '- a\n  > +\n```\n',
    '- a\n  > +\n~~~~\nz\n~~~\n',
    '- a\n  > > > > > +\n  b\n',
    '> > +\n>   b\n',
    '> > +\n>   > b\n',
    ':: t\n: d\n  > +\nb\n',
    '> - a\n>   > +\n>     b\n',
    '> - a\n>   > +\nb\n',
    '> - a\n>   > +\n> ```\nz\n```\n',
    '> - a\n>   > > +\n>     > b\n',
    '- a\n  > +\n```\nz\n> ```\n',
    '- a\n  > +\n```\nz\n```~\n',
    // Moved by the 0.1.14 layout readings (carve-js and the spec model agree).
    '- a\n  > +\n   b\n',
    '- a\n  > +\n  - s\n',
    '- a\n  > +\n  > b\n',
    '- a\n  > +\n# h\n',
    '- a\n  > > q\n  > +\n  b\n',
    '1. a\n  > +\n  b\n',
    '- a\n > +\nb\n',
    'x\n  > +\n  b\n',
    '- a\n  > +\n```\nz\n```\n',
    ': d\n  > +\nb\n',
    '> - a\n>   > +\n> ```\nz\n> ```\n',
    '> - a\n>   > +\n>     - s\n',
    '> - a\n>   > +\n>   > b\n',
    '> - a\n>   > +\n```\nz\n```\n',
];
const TEXT = [
    '- > a\n    > +\nb\n',
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
    const engineText = renderHtml(parse(source)).includes('+');
    if (engineText === marker) {
        failures++;
        console.error(`carve-js: ${JSON.stringify(source)} reads the + as ${engineText ? 'text' : 'a marker'}`);
    }
    for (const [name, { tokenize, marks }] of Object.entries(ENGINES)) {
        const scoped = marks(scopeAt(tokenize(source), source.lastIndexOf('+')));
        if (scoped !== marker) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - the + is ${scoped ? '' : 'not '}scoped as a marker`);
        }
    }
};
for (const source of MARKER) check(source, true);
for (const source of TEXT) check(source, false);

assert.equal(failures, 0, `${failures} shape(s) disagree`);
console.log(`item quote first-block +: ${MARKER.length + TEXT.length} shapes agree with carve-js in prism and highlight.js`);
