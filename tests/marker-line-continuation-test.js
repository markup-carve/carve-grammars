/**
 * A `+` that is the whole content of a list item's, a description's, a quote's
 * or a footnote's first line is the continuation marker, and takes the scope a
 * lone `+` line gets.
 *
 * Rows follow the carve spec model since the relative-column ruling
 * (markup-carve/carve#3445). After a list or description marker the `+` is a
 * marker whatever follows. After a quote or footnote marker, and on a line of
 * its own, it is a marker only when the next line starts at the right column.
 * TextMate cannot see the next line, so it leaves those forms unscoped; the
 * `textmate` misses below pin that.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const tm = await textmateLineTokenizer(fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url)));

const ENGINES = {
    textmate: { tokenize: tm, marks: (scope) => scope.includes('punctuation.definition.list.continuation.carve') },
    prism: { tokenize: prismTokens, marks: (scope) => scope.includes('continuation-marker>punctuation') },
    highlightjs: { tokenize: hljsTokens, marks: (scope) => scope === 'punctuation' },
};

const MARKER = [
    '- +\n| a |',
    ['- a\n+\nx', ['textmate']],
    '-   +\nx',
    '1.  +\nx',
    '- +  \n| a |',
    '- +\t\n| a |',
    '* +\nx',
    '- +',
    '- +\n\nx',
    '1. +\n| a |',
    '. +\nx',
    'a) +\nx',
    '- [ ] +\n| a |',
    '- [x] +\nx',
    ':: t\n: +\n| a |',
    ':: t\n:  +\nx',
    '- - +\nx',
    '  - +\nx',
    '- a\n  - +\n  x',
    '> - +\n> x',
    '> 1. +\n> x',
    '> - [ ] +\n> x',
    ['> +\nx', ['textmate']],
    ['> +\n| a |', ['textmate']],
    ['> > +\nx', ['textmate']],
    ['> +\n>x', ['textmate']],
    ['> > +\n>> x', ['textmate']],
    ['[^a]: +\nx', ['textmate']],
    ['[^a]: +\n```\nx\n```', ['textmate']],
    ['[^a]: +\n> q', ['textmate']],
    // A lone `+` at a nested item's marker column.
    ['- a\n  - b\n  +\n  c', ['textmate']],
    // A second marker of another kind before the `+`; TextMate does not scope
    // that marker either, nor a quoted description.
    ['- 1. +\nx', ['textmate']],
    ['1. - +\nx', ['textmate']],
    ['- [ ] - +\nx', ['textmate']],
    ['> :: t\n> : +\n> x', ['textmate', 'prism', 'highlightjs']],
    '-{.c} +\n| a |',
    '1.{.c} +\n| a |',
    '*{.c} +\nx',
    '.{.c} +\nx',
    'a){.c} +\nx',
    '-{#id .c} +\nx',
    '-{title="a}b"} +\nx',
    '-{} +\nx',
    '-{.c}  +\nx',
    '-{.c} +  \nx',
    '- a\n  -{.c} +\n  x',
    '> -{.c} +\n> x',
    '> 1.{.c} +\n> x',
];

// The glued attribute block keeps its own scope in front of the marker.
const ATTRS = { textmate: 'meta.attributes', prism: 'attributes', highlightjs: 'attr' };
const GLUED = ['-{.c} +\nx', '1.{.c} +\nx', '-{#id .c} +\nx'];

// Rows where the `+` is text. The names list the grammars that scope it anyway.
const TEXT = [
    ['+\nx'],
    ['  +'],
    ['\t+'],
    ['- a\n  +'],
    ['- a\n\t+\n'],
    ['- x\n  > q\n  +\n'],
    ['>  +\nx'],
    ['> \t+\nx'],
    ['```\n+\n```'],
    ['- +x'],
    ['- + x'],
    ['- [ ] + x'],
    ['- [x] +x'],
    ['- +\u00a0\nx'],
    ['+ x'],
    [': +\nx'],
    ['> +x\ny'],
    ['> +\n\nx'],
    ['> +'],
    ['> +\n> x'],
    ['> +\n  x'],
    ['> > +\n\nx'],
    // Every `>` before the `+` needs its space (markup-carve/carve#3421):
    // these lines are paragraph text, or `>+` inside a quote.
    ['>+\nx'],
    ['>>+\nx'],
    ['>> +\nx'],
    ['> >+\nx'],
    ['>+\n| a |'],
    ['>> para\n>>+\nx'],
    ['>>+\n>> para'],
    ['>+\n>x'],
    ['>>+\n> x'],
    ['> > >+\n> x'],
    ['> - a\n>\n>+\n> b'],
    ['> > - a\n> >\n>>+\nb'],
    ['> > - a\n> >\n> >+\nb'],
    ['>+x\ny'],
    ['>+\n\nx'],
    ['>+'],
    ['>+\n> x'],
    ['>>+\n\nx'],
    ['>>+\n> > x'],
    ['> > x\n>>+\ny'],
    ['>>+\n>>+\nx'],
    ['>>  +\nx'],
    ['>> + x'],
    // A column-0 list stays outside a note (markup-carve/carve#3482).
    ['[^a]: +\n- b'],
    ['[^a]: +\n1. b'],
    ['[^a]: +\n- [ ] b'],
    ['[^a]: +\n\nx'],
    ['[^a]: +'],
    ['[^a]: +\n  x'],
    ['-{.c} + x'],
    ['-{.c} +x'],
    ['-{.c}+\nx'],
    ['-{+a+} +\nx'],
    ['x\n{.c} +\nx'],
    // Prism reads the `+` after a glued block from where 'list' left the
    // fragment, and a document's first line is a fragment start too.
    ['{.c} +\nx', ['prism']],
    // carve-js reads these `+` as markers too. A grammar scopes the `+` only
    // where it also scopes the marker before it: after a bullet and before a
    // glued block (Prism and highlight.js). None reaches a marker or task box
    // after a glued block.
    ['- -{.c} +\nx', ['prism', 'highlightjs']],
    ['-{.c} [ ] +\nx'],
    ['-{.c} - +\nx'],
];

const plus = (tokens) => tokens.filter((t) => t.text.includes('+'));
let failures = 0;
for (const [name, { tokenize, marks }] of Object.entries(ENGINES)) {
    for (const row of MARKER) {
        const [source, missed = []] = Array.isArray(row) ? row : [row];
        const hits = plus(tokenize(source));
        const ok = hits.some((t) => t.text.trim() === '+' && marks(t.scope ?? ''));
        if (ok === missed.includes(name)) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - expected the + ${missed.includes(name) ? 'unscoped' : 'scoped as the continuation marker'}: ${JSON.stringify(hits)}`);
        }
    }
    for (const [source, residual = []] of TEXT) {
        const scoped = plus(tokenize(source)).some((t) => marks(t.scope ?? ''));
        if (scoped !== residual.includes(name)) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - expected the + ${residual.includes(name) ? 'scoped' : 'unscoped'}`);
        }
    }
}
for (const [name, { tokenize }] of Object.entries(ENGINES)) {
    for (const source of GLUED) {
        const block = tokenize(source).filter((t) => /[{}]/.test(t.text));
        if (!block.length || !block.every((t) => (t.scope ?? '').includes(ATTRS[name]))) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - the attribute block lost its scope: ${JSON.stringify(block)}`);
        }
    }
}
assert.equal(failures, 0, `${failures} marker-line continuation row(s) failed`);
console.log('marker-line continuation: each grammar scopes a lone + on a marker line as the spec model reads it, misses pinned');
