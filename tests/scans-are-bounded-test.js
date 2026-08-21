/*
 * The rules that used to scan to end of document must keep their bounds.
 *
 * WHY. Prism and highlight.js hand the WHOLE document to each pattern and retry
 * at successive positions. A quantifier that can run to the end of the document
 * therefore costs O(n) at each of n positions - quadratic in the document, not
 * in the construct. Measured at x4 per doubling of input across nine different
 * opener shapes; 192 KB of one of them took ~22 seconds, which is a hung tab
 * for anyone highlighting untrusted Carve in a browser.
 *
 * Bounding the scan makes the per-position cost a constant and the whole
 * tokenize linear. Every shape below moved from x4 to x2 per doubling.
 *
 * SCOPE. This does not forbid unbounded scans generally - both files still
 * carry dozens, most of them line-bounded (`[^...\n]`), and none of those
 * showed superlinear growth on any opener the sweep tries. It pins the ones
 * that DID, so a rewrite cannot quietly undo them. `npm run perf:sweep` is how
 * new ones are found; it is not run in CI because a timing measurement on a
 * machine carrying other load measures the load.
 *
 * The TextMate grammar is absent on purpose: TextMate engines tokenize a line
 * at a time, so document length never compounds there.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

/*
 * Each entry: the rule, a substring that identifies its line, and how many
 * bounded quantifiers that line must carry. The marker is deliberately a piece
 * of the pattern rather than a line number, so moving the rule does not break
 * the test while rewriting it does.
 */
const BOUNDED = {
    'prism/carve.js': [
        ['citation', '@[A-Za-z0-9_]', 2],
        ['footnote reference', '/\\[\\^[^\\]]', 1],
        ['inline footnote', '/\\^\\[[^\\]\\n]', 1],
        ['autolink', 'a-zA-Z0-9+.-]*:[^>', 3],
        ['critic comment', '/\\{#[^}]', 1],
        ['inline code', '(`{1,16})(?:[^`]|[^`][\\s\\S]', 2],
        ['raw inline', '\\1\\{=[A-Za-z_][\\w-]*\\}/', 2],
        ['fenced block info string', "[^\\n]{0,512}\\n[\\s\\S]", 1],
        ['bracket label body', "var BRACKET_SCAN =", 1],
        // Matched on `/\\{%[^` rather than on the bounded class, so a REVERT of
        // this rule trips the bounds assertion below instead of the
        // "is still there" one - the failure has to name the defect.
        ['inline comment', '/\\{%[^', 3],
    ],
    'highlightjs/carve.js': [
        ['citation', '@[A-Za-z0-9_]', 2],
        ['footnote reference', '/\\[\\^[^\\]]', 1],
        ['inline footnote', '/\\^\\[[^\\]\\n]', 1],
        ['autolink', 'https?:\\/\\/|mailto:', 1],
        ['critic comment', '/\\{#(?=[^}\\n]', 1],
        ['bracket label body', 'const BRACKET_SCAN =', 1],
    ],
};

// `[^...]*` and `[^...]+` are the shapes that run to end of document. The class
// body may itself carry an escaped `]` (`[^\]@]`), so the scan for it has to
// resolve escapes - matching `[^` up to the first bare `]` stops INSIDE the
// class and reports nothing, which is a check that cannot fail. That was the
// first version of this test, found by reverting a rule and watching it pass.
//
// THE TRAILING `?` IS PART OF THE SHAPE, NOT AN EXEMPTION. This used to end in
// `(?!\?)`, which excluded the LAZY quantifiers - so `[^\n]*?` was invisible to
// the one check that exists to find unbounded scanning. Lazy and greedy cost
// the same when the match FAILS, and failing is where the quadratic cost comes
// from: the engine still has to try every length before it gives up. The
// exclusion hid a live quadratic in `prism/carve.js` (the `{% %}` rule, 312 ms
// on 48 KB of openers, carve-grammars#298) through every run of this file.
const UNBOUNDED = /\[\^(?:\\.|[^\\\]])*\][*+]\??/g;
const BOUND = /\{\d*,\d+\}/g;

for (const [file, rules] of Object.entries(BOUNDED)) {
    const lines = readFileSync(resolve(here, '..', file), 'utf8').split('\n');
    for (const [rule, marker, expected] of rules) {
        const line = lines.find((l) => l.includes(marker));

        ok(`${file}: ${rule} is still there`, () => {
            assert.ok(line, `no line matching ${JSON.stringify(marker)} - did the rule move or get rewritten?`);
        });

        ok(`${file}: ${rule} scans are bounded`, () => {
            const unbounded = line.match(UNBOUNDED) || [];
            assert.deepStrictEqual(
                unbounded,
                [],
                `unbounded scan in ${file} ${rule}: ${unbounded.join(', ')} - `
                    + 'bound it with {0,N} or the tokenize goes quadratic again',
            );
            const bounds = (line.match(BOUND) || []).map((b) => Number(b.match(/(\d+)\}/)[1]));
            assert.ok(
                bounds.length >= expected,
                `${file} ${rule}: expected at least ${expected} bounded scans, found ${bounds.length}`,
            );
            for (const bound of bounds) {
                assert.ok(
                    bound >= 16,
                    `${file} ${rule} bounds a scan at ${bound}, which is tight enough to stop `
                        + 'highlighting something an author would plausibly write',
                );
            }
        });
    }
}

/*
 * THE ORACLE HAS TO BE SEEN REJECTING SOMETHING.
 *
 * Everything above asserts that lines in the shipped grammars are clean, so it
 * passes just as happily when `UNBOUNDED` matches nothing at all - which is
 * exactly what happened for two releases while the `(?!\?)` was there. Each
 * line below is the REAL pre-fix text of a rule this repo has already had to
 * bound, taken from the commit before its fix, and the check must report every
 * one of them.
 *
 * `{%` is the lazy one. It is reported only by the widened regex; the narrow
 * form is kept beside it and asserted to MISS it, so the widening is pinned by
 * a demonstration rather than by a comment.
 */
const MUST_REPORT = [
    // prism/carve.js before #229 - inline footnote, greedy `*`.
    ['inline footnote, pre-#229', String.raw`            pattern: /\^\[[^\]\n]*\]/,`],
    // prism/carve.js before #229 - footnote reference, greedy `+`.
    ['footnote reference, pre-#229', String.raw`            pattern: /\[\^[^\]]+\]/,`],
    // prism/carve.js before #229 - critic comment, greedy `*`.
    ['critic comment, pre-#229', String.raw`            pattern: /\{#[^}]*#\}/,`],
    // prism/carve.js before #298 - inline comment, LAZY `*?`. Invisible to the
    // narrow regex, which is the defect this list exists to pin.
    ['inline comment, pre-#298', String.raw`                pattern: /\{%[^\n]*?%\}/,`],
];

// A bounded scan is not a finding, lazy or not. Without this the check could
// be "widened" into flagging every quantifier and would still pass above.
const MUST_NOT_REPORT = [
    // The bounded-LAZY near miss: carve-grammars#298 proposed this shape for
    // the rule above. It is bounded, so it is not a finding - and it is the
    // case a widening done by deleting the `?` from the QUANTIFIER instead of
    // from the lookahead would get wrong. The shipped rules are not repeated
    // here; the registry loop above already reads them out of the files, so a
    // copy would only rot.
    ['a bounded lazy scan', String.raw`                pattern: /\{%[^\n]{0,512}?%\}/,`],
];

const NARROW = /\[\^(?:\\.|[^\\\]])*\][*+](?!\?)/g;

console.log('\noracle fixtures:');
for (const [name, line] of MUST_REPORT) {
    ok(`reports ${name}`, () => {
        assert.ok(
            (line.match(UNBOUNDED) || []).length > 0,
            `UNBOUNDED did not report ${JSON.stringify(line)} - the check cannot fail, `
                + 'so the clean results above mean nothing',
        );
    });
}
for (const [name, line] of MUST_NOT_REPORT) {
    ok(`leaves ${name} alone`, () => {
        assert.deepStrictEqual(line.match(UNBOUNDED) || [], [], `UNBOUNDED wrongly reported ${name}`);
    });
}
ok('the lazy fixture is the one the narrow regex missed', () => {
    const lazy = MUST_REPORT.find(([name]) => name.includes('#298'))[1];
    assert.deepStrictEqual(
        lazy.match(NARROW) || [],
        [],
        'the pre-#298 rule is no longer a demonstration of the blind spot - pick one that is',
    );
    assert.deepStrictEqual(lazy.match(UNBOUNDED), ['[^\\n]*?']);
});

console.log(`\n${passed} passed`);
