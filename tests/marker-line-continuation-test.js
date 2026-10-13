/**
 * A `+` that is the whole content of a list item's, a description's, a quote's
 * or a footnote's first line is the continuation marker, and takes the scope a
 * lone `+` line already gets.
 *
 * List and description rows are measured against carve-js main: `- +` over a
 * table renders the table inside the item, trailing spaces or a tab included,
 * whatever follows. The quote and footnote rows follow the ruling on
 * markup-carve/carve#3105, which carve-js does not implement yet: there the
 * `+` is a marker only when a non-blank flush-left line follows. TextMate
 * cannot see the next line, so it scopes those two forms regardless; the
 * `textmate` residuals below pin that.
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
    '> +\nx',
    '> +\n| a |',
    '> > +\nx',
    '[^a]: +\nx',
    '[^a]: +\n```\nx\n```',
    '[^a]: +\n> q',
];

// Rows where the `+` is text, or a marker a grammar cannot reach. The names
// list the grammars that scope it.
const TEXT = [
    ['- +x'],
    ['- + x'],
    ['- +\u00a0\nx'],
    ['+ x'],
    [': +\nx'],
    ['> +x\ny'],
    ['> +\n\nx', ['textmate']],
    ['> +', ['textmate']],
    ['> +\n> x', ['textmate']],
    ['> +\n  x', ['textmate']],
    ['> > +\n\nx', ['textmate']],
    ['[^a]: +\n\nx', ['textmate']],
    ['[^a]: +', ['textmate']],
    ['[^a]: +\n  x', ['textmate']],
    // carve-js reads these `+` as markers too. A grammar scopes the `+` only
    // where it also scopes the marker before it: Prism reaches a second marker
    // of another kind, the others do not, and none reaches a glued attribute
    // block or a quoted description.
    ['- 1. +\nx', ['prism']],
    ['1. - +\nx', ['prism']],
    ['- [ ] - +\nx', ['prism']],
    ['-{.c} +\nx'],
    ['> :: t\n> : +\n> x'],
];

const plus = (tokens) => tokens.filter((t) => t.text.includes('+'));
let failures = 0;
for (const [name, { tokenize, marks }] of Object.entries(ENGINES)) {
    for (const source of MARKER) {
        const hits = plus(tokenize(source));
        const ok = hits.some((t) => t.text.trim() === '+' && marks(t.scope ?? ''));
        if (!ok) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - the + is not the continuation marker: ${JSON.stringify(hits)}`);
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
assert.equal(failures, 0, `${failures} marker-line continuation row(s) failed`);
console.log('marker-line continuation: a lone + on a marker line is scoped as the continuation marker in all three grammars');
