/**
 * A continuation marker after quote prefixes needs one space after each `>`
 * (markup-carve/carve#3421). `>+`, `>>+` and `>> +` are paragraph text, like
 * `>x` and `>> q`; `> >+` is a quote holding the text `>+`, like `> >x`. Only
 * `> +` and `> > +` are markers. TextMate cannot see the next line, so it
 * leaves the quote-line marker unscoped (pinned in marker-line-continuation).
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const tm = await textmateLineTokenizer(fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url)));

const ENGINES = {
    textmate: {
        tokenize: tm,
        quote: (scope) => scope.includes('punctuation.definition.quote.carve'),
        marks: null,
    },
    prism: {
        tokenize: prismTokens,
        quote: (scope) => scope.startsWith('blockquote'),
        marks: (scope) => scope.includes('continuation-marker>punctuation'),
    },
    highlightjs: {
        tokenize: hljsTokens,
        quote: (scope) => scope === 'quote',
        marks: (scope) => scope === 'punctuation',
    },
};

// No quote scope on the line, and the `+` is no marker.
const TEXT = ['>+\nx', '>>+\nx', '>> +\nx', '>+\n\nx', '>+', '>>+\n>>+\nx', '>+ \nx', '>> para\n>>+\nx', '>+x\ny', '>>  +\nx', '>> + x', '>> x', '>>x'];
// A quote on the first `>`; the `+` is text.
const QUOTED_TEXT = ['> >+\nx', '> >+', '> > >+\nx'];
// The `+` is the continuation marker.
const MARKER = ['> +\nx', '> > +\nx', '> - a\n>\n> +\n> b', '> > - a\n> >\n> > +\n> > b'];

const scopeAt = (tokens, at) => {
    let offset = 0;
    for (const token of tokens) {
        if (at >= offset && at < offset + token.text.length) return token.scope ?? '';
        offset += token.text.length;
    }
    return '';
};
const plusLine = (source) => source.lastIndexOf('\n', source.lastIndexOf('+')) + 1;

let failures = 0;
const fail = (name, source, why) => {
    failures++;
    console.error(`${name}: ${JSON.stringify(source)} - ${why}`);
};
for (const [name, { tokenize, quote, marks }] of Object.entries(ENGINES)) {
    for (const source of TEXT) {
        const tokens = tokenize(source);
        if (quote(scopeAt(tokens, plusLine(source)))) fail(name, source, 'a glued > took the quote scope');
        if (marks && marks(scopeAt(tokens, source.lastIndexOf('+')))) fail(name, source, 'the + is scoped as a marker');
    }
    for (const source of QUOTED_TEXT) {
        const tokens = tokenize(source);
        if (!quote(scopeAt(tokens, 0))) fail(name, source, 'the first > lost its quote scope');
        if (marks && marks(scopeAt(tokens, source.indexOf('+')))) fail(name, source, 'the + is scoped as a marker');
    }
    for (const source of MARKER) {
        const tokens = tokenize(source);
        const at = source.lastIndexOf('+');
        if (!quote(scopeAt(tokens, plusLine(source)))) fail(name, source, 'the + line has no quote scope');
        if (marks && !marks(scopeAt(tokens, at))) fail(name, source, 'the + is not scoped as a marker');
    }
}
assert.equal(failures, 0, `${failures} glued quote prefix row(s) failed`);
console.log('glued quote prefix: only a spaced > + line holds a marker in all three grammars');
