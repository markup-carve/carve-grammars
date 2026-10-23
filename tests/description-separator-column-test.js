/**
 * A `:` description separator continues a definition list only at the column
 * of a term above it (markup-carve/carve#3458). Below or right of that column
 * it is paragraph or description text, so Prism and highlight.js must not
 * scope it as the marker. Each shape is checked against carve-js too. Prism
 * reads a term that starts its text as a fragment after a list marker, so the
 * TEXT shapes open below a paragraph. A term indented past column 0 needs a
 * list item or description whose content column it reaches, and a
 * quoted list takes its markers after the `> ` prefix.
 */
import assert from 'node:assert/strict';

import { parse, renderHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { fileURLToPath } from 'node:url';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
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
    '> :: t\n> : d\n> : e\n',
    '> :: t\n> : d\n>   :: u\n>   : v\n>   : e\n',
    '1. x\n   :: t\n   : e\n',
    '- x\nother\n  :: t\n  : d\n',
    '- x\nother\nmore\n  :: t\n  : d\n',
    '1. x\nother\n   :: t\n   : d\n',
    `- x\n${' '.repeat(13)}:: t\n${' '.repeat(13)}: d\n`,
    `- x\n${'  filler\n'.repeat(65)}  :: t\n  : d\n`,    // A quoted term hosted by a quoted list item or description.
    '> - x\n>   :: t\n>   : e\n',
    '> 1. x\n>    :: t\n>    : e\n',
    '> > - x\n> >   y\n> >   :: t\n> >   : e\n',
    '- > - x\n  >   :: t\n  >   : e\n',
    '> - x\n> \n> \n>   :: t\n>   : e\n',
    '> :: t\n> : d\n>   :: u\n>   : e\n',
    '> - x\n>   :: a\n> :: u\n> : e\n',
];
const TEXT = [
    '- x\n  :: t\n  : d\n: e\n',
    '- x\n  :: t\n  : d\n : e\n',
    '- x\n  :: t\n  : d\n   : e\n',
    '- x\n  :: t\n  : d\n  x\n : e\n',
    'x\n\n:: t\n: d\n  : e\n',
    'x\n\n:: t\n  : d\n',
    '  :: t\n  : d\n  : e\n',
    '1. x\n  :: t\n  : d\n  : e\n',
    '1. x\n  :: t\n  : d\n    :: u\n    : v\n  : e\n',
    '>   :: t\n>   : d\n>   : e\n',
    '- x\n\nother\n  :: t\n  : d\n',
    '- x\n# h\n  :: t\n  : d\n',
    `x\n${' '.repeat(13)}:: t\n${' '.repeat(13)}: d\n`,
    '> :: t\n>   :: u\n>   : v\n',
    '> :: t\n> : d\n> \n> \n>   :: u\n>   : v\n',
    '> :: t\n> : d\n>  :: u\n>  : v\n',    '> 1. x\n>   :: t\n>   : e\n',
    '> - x\n>   :: a\n>     :: u\n>     : e\n',
    '> :: t\n> other\n>   :: u\n>   : e\n',
    '> - x\n> \n> \n> other\n>   :: t\n>   : e\n',
    '> :: t\n> : d\n> \n> \n>   y\n>   :: u\n>   : e\n',
    '> para\n>   :: t\n>   : e\n',
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

// highlight.js compares the expanded column of a tab-indented term.
for (const [source, marker] of [['- x\n\t:: t\n : d\n', false]]) {
    const scoped = ENGINES.highlightjs.marks(scopeAt(hljsTokens(source), source.lastIndexOf(':')));
    if (scoped !== marker) {
        failures++;
        console.error(`highlightjs: ${JSON.stringify(source)} - the last : is ${scoped ? '' : 'not '}scoped as a marker`);
    }
}

// TextMate reads one line at a time: a `:` scopes at the first term's column or
// two or more columns right of it, never below it or one column right.
const tm = await textmateLineTokenizer(fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url)));
const TEXTMATE = [
    [':: t\n: d\n: e\n', true],
    [':: t\n: d\n  :: u\n  : v\n: e\n', true],
    ['- x\n  :: t\n  : d\n  : e\n', true],
    ['- x\n  :: t\n  : d\n: e\n', false],
    ['- x\n  :: t\n  : d\n   : e\n', false],
];
for (const [source, marker] of TEXTMATE) {
    const scoped = /punctuation\.definition\.list\.definition/.test(scopeAt(tm(source), source.lastIndexOf(':')));
    if (scoped !== marker) {
        failures++;
        console.error(`textmate: ${JSON.stringify(source)} - the last : is ${scoped ? '' : 'not '}scoped as a marker`);
    }
}

assert.equal(failures, 0, `${failures} shape(s) disagree`);
console.log(`description separator column: ${MARKER.length + TEXT.length} shapes agree with carve-js in prism and highlight.js`);
