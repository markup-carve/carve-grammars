/**
 * A delimited comment `{% ... %}` takes no inline attributes and joins no
 * attribute run, so an attribute block right after it is text (carve#2932,
 * corpus `321-delimited-comments-9` to `-12`). Each row names a span of the
 * source and whether every character of it is scoped as attributes. The
 * installed engine predates the ruling, so the corpus HTML is the oracle for
 * the comment rows; the attaching rows were rendered with carve-js 0.1.9.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

assertThisFileRuns(import.meta.url);

// [source, span, nth occurrence of span, scoped as attributes]
const rows = [
    ['*x*{% c %}{.k}', '{.k}', 0, false],
    ['[x]{% c %}{.k}', '{.k}', 0, false],
    ['a{% b %}{.c} d', '{.c} d', 0, false],
    ['[x] {% c %}{.k}', '{.k}', 0, false],
    ['a{% b %}{.c}{.d} e', '{.c}{.d} e', 0, false],
    ['a{% b %}{#i .c k=v}', '{#i .c k=v}', 0, false],
    ['*x*{% c %} {.k}', '{.k}', 0, false],
    ['a{% c %}{.k}{% d %}{.m}', '{.m}', 0, false],
    // The run before the comment still attaches; the block after it does not.
    ['*x*{.a}{% c %}{.b}', '{.a}', 0, true],
    ['*x*{.a}{% c %}{.b}', '{.b}', 0, false],
    ['*x*{.k}', '{.k}', 0, true],
    ['*x*{.a}{.b}', '{.a}{.b}', 0, true],
    ['[x]{.k}', '{.k}', 0, true],
    ['a{% b %}*x*{.c}', '{.c}', 0, true],
    ['{% c %}\n{.k}\n# H', '{.k}', 0, true],
    // `%}` also ends an attribute value; only a comment's closer cuts the run.
    ['*x*{k=a%}{.b}', '{k=a%}{.b}', 0, true],
    ['*x*{% c %} {.a}{.b}', '{.a}{.b}', 0, false],
    ['a {% x\ny %}{.k}', '{.k}', 0, false],
];

const surfaces = [
    ['prism', prismTokens, (s) => /attributes/.test(s ?? '')],
    ['highlightjs', hljsTokens, (s) => s === 'attr'],
    ...(await textmateEngines(textmateLineTokenizer)).map(([name, tokenize]) => [name, tokenize, (s) => /\battributes\.carve\b/.test(s ?? '')]),
];

const failures = [];
let checked = 0;
for (const [name, tokenize, isAttr] of surfaces) {
    for (const [source, span, nth, attaches] of rows) {
        const tokens = await tokenize(`${source}\n`);
        let at = -1;
        for (let i = 0; i <= nth; i++) at = source.indexOf(span, at + 1);
        const wrong = [];
        let offset = 0;
        for (const token of tokens) {
            const start = offset;
            offset += token.text.length;
            if (offset <= at || start >= at + span.length) continue;
            if (isAttr(token.scope) !== attaches) wrong.push(JSON.stringify(token.text));
        }
        if (wrong.length) failures.push(`${name}: ${JSON.stringify(source)} ${attaches ? 'must scope' : 'must leave literal'} ${span}, wrong: ${wrong.join(' ')}`);
        checked++;
    }
}

assert.deepEqual(failures, []);
console.log(`comment attribute run: ${checked} rows across ${surfaces.length} surfaces`);
