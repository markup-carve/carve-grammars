/**
 * A hyphen run after whitespace stays text unless whitespace also follows it.
 *
 * CARVE-P3-021 reads both neighbors through the closed `typography_flank`
 * class (space, tab, line ending, U+00A0, a break). The grammars used to test
 * only for a following word character, so `a --. b` and `a ---> b` were
 * scoped as dashes, and TextMate had no guard at all (carve-grammars#833).
 *
 * @module tests/dash-flag-flank-test
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ENGINES } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const TYPOGRAPHY = /typography|constant|literal/;

/** Each input with the dash runs that must carry a typography scope, per the spec model. */
const CASES = [
    // The reproduction (carve-grammars#833).
    ['a --. b', []],
    ['a ---> b', []],
    ['x --flag', []],
    ['a ---, b', []],
    ['a --) b', []],
    ['a ----x b', []],
    ['--x at the start', []],
    ['a (--x) b', []],
    ['a "--x" b', []],
    ['a --x b', []],
    // Neighbors that keep their dash.
    ['a -- b', ['--']],
    ['a --- b', ['---']],
    ['1--10', ['--']],
    ['a --', ['--']],
    ['a---b', ['---']],
    ['a--.b', ['--']],
    ['a--->b', ['---']],
    ['a(--x) b', ['--']],
    ['((--x)) b', ['--']],
    ['a -- b', ['--']],
    ['a --\\ b', ['--']],
    ['a  --x', ['--']],
    ['a --> b', ['-->']],
    // A span's closer is not a following character.
    ['p *a --* q', ['--']],
    ['p /a ---/ q', ['---']],
    ['p {=a --=} q', ['--']],
    ['a --*b', []],
];

/** Typography-scoped text, with adjacent pieces of one run merged. */
function dashRuns(tokens) {
    const out = [];
    let previous = false;
    for (const token of tokens) {
        const scoped = TYPOGRAPHY.test(token.scope ?? '') && /^[-<>]+$/.test(token.text);
        if (scoped && previous) out[out.length - 1] += token.text;
        else if (scoped) out.push(token.text);
        previous = scoped;
    }

    return out;
}

const surfaces = [...ENGINES, ...(await textmateEngines())];

for (const [surface, tokenize] of surfaces) {
    for (const [input, expected] of CASES) {
        test(`${surface}: ${JSON.stringify(input)} scopes ${JSON.stringify(expected)}`, () => {
            assert.deepEqual(dashRuns(tokenize(`${input}\n`)), expected);
        });
    }
}
