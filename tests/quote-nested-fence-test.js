// carve-grammars#868: a fence behind a quote marker ends at its own depth in
// the TextMate grammar. A code fence continues only on lines that carry all of
// its markers (a bare `> >` included) and takes no lazy line; a comment fence
// closes on a `%%%` behind at most its own markers. Every expectation is
// checked against carve-js in both directions.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const tokenize = await textmateLineTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);

function verbatimWords(src) {
    const words = new Map();
    for (const leaf of tokenize(src)) {
        for (const w of leaf.text.match(/w\d+/g) ?? []) {
            words.set(w, /markup\.raw\.(?!inline)|comment\.block/.test(leaf.scope));
        }
    }
    return words;
}

function engineVerbatim(src, w) {
    const html = carveToHtml(src);
    const word = new RegExp(`\\b${w}\\b`);
    return !word.test(html) || [...html.matchAll(/<pre[\s\S]*?<\/pre>/g)].some((m) => word.test(m[0]));
}

const pre = (depth) => '> '.repeat(depth);
const bare = (depth) => '> '.repeat(depth - 1) + '>';

const CASES = [
    ['the ticket reproduction', '> > ```\n> > w0\n> w1\n', ['w0'], ['w1']],
    ['the comment reproduction', '> > %%%\n> w0\nw1\n', [], ['w0', 'w1']],
    ['a bare shallower line ends the fence', '> > ```\n>\n> w1\n', [], ['w1']],
];
for (const depth of [1, 2, 3]) {
    const p = pre(depth);
    const up = pre(depth - 1);
    for (const fence of ['```', '~~~']) {
        CASES.push(
            [`a ${fence} fence at depth ${depth} closes`, `${p}${fence}\n${p}w0\n${p}${fence}\n${p}w1\n`, ['w0'], ['w1']],
            [`a ${fence} fence at depth ${depth} keeps a bare marker line`, `${p}${fence}\n${p}w0\n${bare(depth)}\n${p}w1\n${p}${fence}\nw2\n`, ['w0', 'w1'], ['w2']],
            [`a ${fence} fence at depth ${depth} takes no lazy line`, `${p}${fence}\n${p}w0\nw1\n${p}${fence}\n`, ['w0'], ['w1']],
            [`a ${fence} fence at depth ${depth} ends at a shallower prefix`, `${p}${fence}\n${p}w0\n${up}w1\n`, ['w0'], ['w1']],
            [`a ${fence} fence at depth ${depth} keeps a deeper closer as content`, `${p}${fence}\n${p}w0\n${p}> ${fence}\n${p}w1\n`, ['w0', 'w1'], []],
            [`a ${fence} fence at depth ${depth} opens behind an indent`, `${p}  ${fence}\n${p}w0\n${p}${fence}\n${p}w1\n`, ['w0'], ['w1']],
            [`a ${fence} fence at depth ${depth} keeps a closer indented past the opener`, `${p}${fence}\n${p}w0\n${p}  ${fence}\n${p}w1\n`, ['w0', 'w1'], []],
            [`a ${fence} fence at depth ${depth} on a list marker line closes`, `- ${p}${fence}\n  ${p}w0\n  ${p}${fence}\n  ${p}w1\n`, ['w0'], ['w1']],
            [`a ${fence} fence at depth ${depth} on a list marker line ends at a shallower prefix`, `- ${p}${fence}\n  ${p}w0\n  ${up}w1\n`, ['w0'], ['w1']],
        );
    }
    CASES.push(
        [`a comment fence at depth ${depth} closes`, `${p}%%%\n${p}w0\n${p}%%%\n${p}w1\n`, ['w0'], ['w1']],
        [`a comment fence at depth ${depth} closes on an indented closer`, `${p}%%%\n${p}w0\n${p}   %%%\n${p}w1\n`, ['w0'], ['w1']],
        [`a comment fence at depth ${depth} closes on a lazy closer`, `${p}%%%\n${p}w0\n%%%\n${p}w1\n`, ['w0'], ['w1']],
        [`a comment fence at depth ${depth} does not close on a deeper closer`, `${p}%%%\n${p}w0\n${p}> %%%\n${p}w1\n${p}%%%\n${p}w2\n`, ['w0', 'w1'], ['w2']],
        [`a comment fence at depth ${depth} ends at a glued marker without closing on it`, `${p}%%%\n${p}w0\n${bare(depth)}%%%\n${p}w1\n`, ['w0'], ['w1']],
        [`a comment fence at depth ${depth} opens behind an indent`, `${p}  %%%\n${p}w0\n${p}%%%\n${p}w1\n`, ['w0'], ['w1']],
        [`a comment fence at depth ${depth} ends at a shallower prefix`, `${p}%%%\n${p}w0\n${up}w1\n`, ['w0'], ['w1']],
        [`a comment fence at depth ${depth} in a list item ends at a shallower prefix`, `- x\n\n  ${p}%%%\n  ${p}w0\n  ${up}w1\n`, ['w0'], ['w1']],
    );
}

for (const [label, src, inside, outside] of CASES) {
    ok(`${label}: ${JSON.stringify(src)}`, () => {
        const words = verbatimWords(src);
        for (const w of inside) {
            assert.equal(engineVerbatim(src, w), true, `carve-js: ${w} is verbatim`);
            assert.equal(words.get(w), true, `${w} must be verbatim`);
        }
        for (const w of outside) {
            assert.equal(engineVerbatim(src, w), false, `carve-js: ${w} is text`);
            assert.equal(words.get(w), false, `${w} must not be verbatim`);
        }
    });
}

console.log(`\n${passed} passed`);
