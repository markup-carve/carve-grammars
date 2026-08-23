/**
 * Every TextMate grammar reads an arrow the way the language spells it.
 *
 * The doubled runs are the CANONICAL arrows in both families
 * (`386-the-doubled-run-is-the-canonical-arrow-in-both-families`), the single
 * runs are deprecated but still rendered, and a bare `=>` is NOT an arrow - it
 * is `key => value`, ordinary prose about code.
 *
 * Prism and highlight.js learned that family; both TextMate grammars did not,
 * and the vscode port additionally highlighted the one run the language says
 * stays literal (carve-grammars#324). Nothing here caught it: the TextMate
 * family has no per-corpus snapshot, only the 41-shape block battery, so its
 * typography rule was unexercised by the corpus.
 *
 * ORDER IS THE WHOLE BUG, not the alternative list. `--` and `---` came first,
 * so appending the doubled forms would have changed nothing: `-->` matches `--`
 * and leaves the `>` as text. Every assertion below is on WHOLE tokens for that
 * reason - a rule that splits an arrow in half still "matches" it.
 *
 * @module tests/smart-typography-test
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { textmateEngines } from './lib/surface-engines.js';
import { typographyAlternatives } from './lib/typography-rule.js';

/** The runs the language calls arrows, and which spelling each is. */
const ARROWS = [
    ['<--', 'canonical'],
    ['-->', 'canonical'],
    ['<-->', 'canonical'],
    ['<==', 'canonical'],
    ['==>', 'canonical'],
    ['<=>', 'canonical'],
    ['<-', 'deprecated'],
    ['->', 'deprecated'],
    ['<->', 'deprecated'],
];

/** The runs that are NOT arrows, each for its own stated reason. */
const NOT_ARROWS = [
    ['=>', 'key => value is prose about code, so the run stays literal'],
];

/**
 * The typography scope, across surfaces that spell it differently.
 *
 * This repo's grammar says `constant.other.smart_typography.carve` and the
 * vscode port says `constant.character.typography.carve`. Matching either keeps
 * the assertion about the READING rather than about one grammar's vocabulary -
 * the first draft matched only the former and reported three arrows the vscode
 * port gets RIGHT as failures, which is the shape of test that gets ignored.
 */
const TYPOGRAPHY = /typography/;

/*
 * WHY A SOURCE CHECK SITS BESIDE THE BEHAVIORAL ONE. vscode-textmate MERGES
 * adjacent tokens carrying identical scopes, so a grammar that reads `<-->` as
 * `<-` followed by `->` hands back ONE token spelling `<-->` - indistinguishable
 * from the correct reading. The first draft of this file asserted "the run comes
 * back as one token" and PASSED on the grammar that has the bug, for that
 * reason. The behavioral assertions still earn their place: they catch every run
 * whose wrong split leaves a character unscoped (`-->` as `--` plus a text `>`).
 * The alternation check catches the rest, and neither alone is enough.
 */
const engines = await textmateEngines();
assert.ok(engines.length > 0, 'no TextMate grammar was reachable');

for (const [surface, tokenize] of engines) {
    for (const [run, kind] of ARROWS) {
        test(`${surface}: ${run} is one ${kind} arrow token`, () => {
            // Padded, so the run is neither at the start of the line nor at its
            // end - the two positions where an anchored rule behaves
            // differently from every other one.
            const tokens = tokenize(`a ${run} b\n`);
            const whole = tokens.find((token) => token.text === run);
            assert.ok(
                whole,
                `${run} did not come back as one token: ` +
                    JSON.stringify(tokens.map((token) => token.text)),
            );
            assert.match(
                whole.scope ?? '',
                TYPOGRAPHY,
                `${run} is one token but carries ${whole.scope}`,
            );
        });
    }

    for (const [run, why] of NOT_ARROWS) {
        test(`${surface}: ${run} is not an arrow - ${why}`, () => {
            const tokens = tokenize(`key ${run} value\n`);
            const typography = tokens.filter((token) => TYPOGRAPHY.test(token.scope ?? ''));
            assert.deepEqual(
                typography.map((token) => token.text),
                [],
                `${run} was scoped as typography`,
            );
        });
    }

    test(`${surface}: a line of arrows splits into whole runs`, () => {
        // The corpus line, which is where the four wrong readings showed.
        const tokens = tokenize('Flow: a --> b <-- c <--> d ==> e; x != y.\n');
        const typography = tokens
            .filter((token) => TYPOGRAPHY.test(token.scope ?? ''))
            .map((token) => token.text);
        assert.deepEqual(typography.slice(0, 4), ['-->', '<--', '<-->', '==>']);
    });
}

/*
 * The alternation itself, which token merging cannot hide.
 *
 * ORDER IS ASSERTED, not just membership: `--` before `-->` swallows the arrow
 * and leaves the `>`, which is the actual defect - appending the doubled forms
 * to the end of the list would have changed nothing.
 */
for (const [surface] of engines) {
    const alternatives = typographyAlternatives(surface);

    for (const [run] of ARROWS) {
        test(`${surface}: ${run} is an alternative of the typography rule`, () => {
            assert.ok(
                alternatives.includes(run),
                `${run} is not in [${alternatives.join(' ')}]`,
            );
        });
    }

    for (const [run, why] of NOT_ARROWS) {
        test(`${surface}: ${run} is not an alternative - ${why}`, () => {
            assert.ok(!alternatives.includes(run), `${run} is still an alternative`);
        });
    }

    test(`${surface}: every run precedes the runs it starts with`, () => {
        const wrong = [];
        for (const [long] of ARROWS) {
            for (const [short] of ARROWS) {
                if (long === short || !long.startsWith(short)) continue;
                if (alternatives.indexOf(long) > alternatives.indexOf(short)) {
                    wrong.push(`${short} precedes ${long}, so ${long} can never match`);
                }
            }
        }
        // `--` and `---` are not arrows but shadow one all the same.
        for (const [long] of ARROWS) {
            for (const dash of ['--', '---']) {
                if (!long.startsWith(dash)) continue;
                const at = alternatives.indexOf(dash);
                if (at !== -1 && at < alternatives.indexOf(long)) {
                    wrong.push(`${dash} precedes ${long}, so ${long} can never match`);
                }
            }
        }
        assert.deepEqual(wrong, []);
    });
}
