// carve-grammars#870: a quote paragraph inside a list item ends where the
// engine ends it. Under a list item's `while` rule every line starts at \G, so
// an end guarded by `(?!\G)` never matched and the paragraph ran on to the end
// of the item. Expectations are checked against carve-js in both directions.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const tokenize = await textmateLineTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
const FENCE = '`'.repeat(3);

const scopeOf = (src, w) => tokenize(src).find((leaf) => new RegExp(`\\b${w}\\b`).test(leaf.text)).scope;

function engineKind(src, w) {
    const html = carveToHtml(src);
    const i = html.search(new RegExp(`(?<=(?:^|>)[^<]*)\\b${w}\\b`));
    if (i < 0) return 'hidden';
    const before = html.slice(0, i);
    const open = (tag) => (before.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length - (before.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
    if (open('pre') > 0) return 'code';
    if (/<h[1-6][^>]*>[^<]*$/.test(before)) return 'heading';
    return open('blockquote') > 0 ? 'quote' : 'text';
}

function grammarKind(src, w) {
    const scope = scopeOf(src, w);
    if (/comment\.block/.test(scope)) return 'hidden';
    if (/markup\.raw\.(?!inline)|fenced_code/.test(scope)) return 'code';
    if (/markup\.heading/.test(scope)) return 'heading';
    return /markup\.quote/.test(scope) ? 'quote' : 'text';
}

const CASES = [
    ['a heading after a blank line', '- x\n\n  > q\n\n  ## w9\n', 'heading'],
    ['a heading after a blank line, quote on the marker line', '- > q\n\n  ## w9\n', 'heading'],
    ['a fence after quoted prose', '- x\n\n  > x\n  > ~~~\n  > w9\n', 'code'],
    ['a backtick fence after quoted prose', `- x\n\n  > x\n  > ${FENCE}\n  > w9\n  > ${FENCE}\n`, 'code'],
    ['a fence at the item column after the quote', '- x\n\n  > w0\n  ~~~\n  w9\n', 'code'],
    ['a comment at the item column after the quote', '- x\n\n  > w0\n  %%%\n  w9\n  %%%\n', 'hidden'],
    ['a paragraph after a blank line', '- x\n\n  > w0\n\n  w9\n', 'text'],
    ['a numbered item', '1. x\n\n   > w0\n   ~~~\n   w9\n', 'code'],
    ['a task item', '- [ ] x\n\n  > w0\n\n  # w9\n', 'heading'],
    ['a nested quote', '- x\n\n  > > w0\n  > ~~~\n  > w9\n', 'code'],
    ['a quoted line keeps the paragraph', '- x\n\n  > w0\n  > w9\n', 'quote'],
    ['a lazy line keeps the paragraph', '- x\n\n  > w0\n  w9\n', 'quote'],
    ['a quoted heading stays out of the paragraph', '- x\n\n  > w0\n  > ## w9\n', 'heading'],
];

for (const [label, src, kind] of CASES) {
    ok(`${label}: ${JSON.stringify(src)}`, () => {
        assert.equal(engineKind(src, 'w9'), kind, 'carve-js');
        assert.equal(grammarKind(src, 'w9'), kind, 'TextMate');
    });
}

console.log(`\n${passed} passed`);
