/*
 * AN UNCLOSED BOLD OPENER MUST NOT COLOUR THE REST OF THE FILE.
 *
 * `repository.strong` is the ONLY bare inline rule in this grammar spelled
 * begin/end rather than as a single `match`, and it has to be: a TextMate
 * `match` cannot cross a line break at all, while the engine reads `a *b` over
 * `c* d` as one bold run. Its four `match` siblings therefore get multi-line
 * runs wrong, and this rule gets them right - and pays for it, because a
 * begin/end rule with no closer stays open. `a *b c` coloured the next
 * paragraph, the heading after it and everything past that
 * (carve-grammars#393).
 *
 * A BLANK LINE NOW ENDS THE RUN, which bounds the damage at the paragraph
 * without costing the line-spanning the rule exists for.
 *
 * WHAT IS NOT FIXED, and is pinned below rather than left silent: a genuinely
 * unclosed opener still colours to the end of its own paragraph. `begin` cannot
 * see whether a closer exists on a later line, and TextMate offers no way to
 * ask - the lookahead sees the current line only. Eliminating it would mean
 * giving up multi-line bold, which trades one defect for another.
 *
 * WHY NOT tests/lib/textmate-engine.js. That harness drives Shiki, and Shiki
 * reports this fix as having NO EFFECT - same grammar, same document, and the
 * bold run still swallows the next paragraph (carve-grammars#395). A test
 * written against it would call a correct grammar broken. This file drives
 * vscode-textmate directly, which is what VS Code runs.
 */
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carveToHtml } from '@markup-carve/carve';
import { textmateLineTokenizer, covered } from './lib/textmate-lines.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const BOLD = 'markup.bold.carve';
const tokenize = await textmateLineTokenizer(resolve(repoRoot, 'textmate/carve.tmLanguage.json'));

/*
 * A grammar answers in SOURCE and the engine in RENDERED text, and the two
 * differ by the line break a multi-line run holds: source `*b\nc*` renders
 * `bc`. Dropping newlines from both puts them in one alphabet. Nothing below
 * turns on a newline INSIDE the compared run, so this cannot hide a defect.
 */
const flatten = (s) => s.replace(/\n/g, '');

/** Every run the engine wraps in `strong`, concatenated. */
const engineBold = (source) => flatten([...carveToHtml(source).matchAll(/<strong>([\s\S]*?)<\/strong>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ''))
    .join(''));

/** Every run this grammar scopes as bold, concatenated. */
const grammarBold = (source) => flatten(covered(tokenize, source, BOLD));

/*
 * THE TOKENIZER HAS TO REPRODUCE ITS INPUT.
 *
 * The whole defect lives in what happens ACROSS a blank line, so a tokenizer
 * that quietly drops one measures a different document and passes. That is not
 * hypothetical here - it is the difference between this harness and the Shiki
 * one, and it is why #393 went unseen.
 */
console.log('the tokenizer is faithful:');

ok('every character comes back, blank lines included', () => {
    for (const doc of ['a *b c\n\nnext\n\n# h', 'a\n\n\nb', '*x*\n', '\n\na *b* c']) {
        assert.equal(tokenize(doc).map((l) => l.text).join(''), doc,
            `the tokenizer did not reproduce ${JSON.stringify(doc)} - it is measuring a different document`);
    }
});

const ROWS = [
    ['a *b* c', 'a closed run on one line'],
    ['a *b c* d', 'a closed run holding a space'],
    ['a *b\nc* d', 'a run across a soft line break, which only begin/end can do'],
    ['a *b\nc\nd* e', 'and across two of them'],
    ['a *b * c* d', 'a false closer inside the run does not end it'],
    ['- *b* c', 'inside a list item'],
    ['| a | b |\n|---|---|\n| *c* | d |', 'inside a table cell'],
];

console.log('\nthe run this grammar colours, against the engine:');

for (const [source, why] of ROWS) {
    ok(why, () => {
        assert.equal(grammarBold(source), engineBold(source),
            `${JSON.stringify(source)}: the engine bolds ${JSON.stringify(engineBold(source))} `
                + `and this grammar colours ${JSON.stringify(grammarBold(source))}`);
    });
}

/*
 * THE ROWS THAT ARE STILL WRONG, pinned exactly.
 *
 * Both are the same residual: an opener with no closer anywhere in its
 * paragraph. `begin` cannot see a later line, so the run opens and colours to
 * the paragraph's end. Asserted rather than omitted, so a fix turns these red
 * and takes them out instead of hiding among the rows above.
 */
const RESIDUALS = [
    ['a *b c', 'b c', 'no closer at all, at end of document'],
    ['a *b * d', 'b * d', 'the only star after the opener stands behind a space'],
];

console.log('\nthe unclosed-opener residual is exactly as wrong as it was:');

for (const [source, expected, why] of RESIDUALS) {
    ok(why, () => {
        assert.equal(engineBold(source), '',
            `${JSON.stringify(source)} started bolding in the engine - this pin's premise is gone`);
        assert.equal(grammarBold(source), expected,
            `${JSON.stringify(source)}: the residual moved. If the grammar now declines it, take the `
                + 'row out of RESIDUALS and put it in ROWS');
    });
}

/*
 * AND THE BLANK LINE IS WHAT BOUNDS THE RESIDUAL.
 *
 * These rows still hold the residual above - the opener never closes - so they
 * cannot be compared against the engine, which bolds nothing in the first two.
 * What they measure is how FAR it reaches: to the end of its own paragraph and
 * not one character past it. That is the whole of carve-grammars#393's fix, and
 * without the terminator every one of them swallowed the rest of the document.
 */
const BOUNDED = [
    ['a *b c\n\nnext paragraph', 'b c', 'an unclosed opener stops at the blank line'],
    ['a *b c\n\nnext paragraph\n\n# a heading', 'b c', 'and does not reach a later heading'],
    ['a *b c\n\nx *y* z', 'b cy', 'and a later run in another paragraph still scopes on its own'],
    ['a *b c\n\nsecond\n\nthird', 'b c', 'and two paragraphs later is untouched'],
    /*
     * A SEPARATOR LINE IS NOT ALWAYS EMPTY. The engine ends a paragraph on a
     * line of spaces or tabs too, so the terminator is `^[ \t]*$` and not `^$`.
     * Written from a mutation that survived: narrowing it to `^$` was caught by
     * nothing until these two rows arrived.
     */
    ['a *b c\n   \nnext paragraph', 'b c', 'a spaces-only line separates too'],
    ['a *b c\n\t\nnext paragraph', 'b c', 'and a tab-only line'],
];

console.log('\nthe blank line is doing the bounding:');

for (const [source, expected, why] of BOUNDED) {
    ok(why, () => {
        const run = grammarBold(source);
        assert.equal(run, expected,
            `${JSON.stringify(source)}: the bold run covers ${JSON.stringify(run)}, expected `
                + `${JSON.stringify(expected)} - without the blank-line terminator it reaches the `
                + 'end of the document');
        for (const past of ['next paragraph', 'heading', 'second', 'third']) {
            assert.ok(!run.includes(past),
                `the run crossed a blank line and reached ${JSON.stringify(past)}`);
        }
    });
}

console.log(`\n${passed} checks passed`);
