/*
 * The citation rule must not scan unbounded on a bracket it cannot close.
 *
 * WHY. Prism and highlight.js hand the WHOLE document to each pattern and retry
 * at successive positions. The citation body was `[^\]@]*@...`, so on input
 * carrying many `[` and no `@`, every one of those positions scanned to the end
 * of the document before failing: O(n) per position over n positions, which is
 * quadratic in the document. It measured x4 per doubling of input on both
 * engines, and 192 KB of unclosed brackets took ~22 seconds - a hung tab for
 * anyone highlighting untrusted Carve in a browser.
 *
 * A bound turns the per-position scan into a constant, so the whole tokenize
 * goes linear: at 48 KB, Prism fell from 1430ms to 57ms and highlight.js from
 * 1479ms to 80ms, both then doubling rather than quadrupling.
 *
 * This checks the SHAPE rather than the clock. A timing assertion on a machine
 * carrying other load measures the load; the property that actually matters is
 * that no quantifier in this rule is allowed to run to the end of the document,
 * and that is readable from the source.
 *
 * The TextMate grammar is not checked here: its citation lookahead is already
 * line-bounded (`[^\]\n]*`), and TextMate engines tokenize a line at a time, so
 * the document length never compounds.
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

/** The citation `begin`/`pattern` line from a grammar source. */
function citationPattern(file, marker) {
    const source = readFileSync(resolve(here, '..', file), 'utf8');
    const line = source.split('\n').find((l) => l.includes(marker));
    assert.ok(line, `no citation pattern in ${file} - did the rule move?`);
    return { file, line };
}

const RULES = [
    citationPattern('prism/carve.js', '@[A-Za-z0-9_]'),
    citationPattern('highlightjs/carve.js', '@[A-Za-z0-9_]'),
];

ok('the citation rule is found in both engine grammars', () => {
    assert.strictEqual(RULES.length, 2);
});

for (const { file, line } of RULES) {
    ok(`${file}: no unbounded negated-class scan in the citation body`, () => {
        // `[^...]*` and `[^...]+` are the shapes that run to end of document.
        // A `{0,N}` bound is what makes the per-position cost a constant.
        // The class body may itself carry an escaped `]` (`[^\]@]`), so the scan
        // for it has to resolve escapes - matching `[^` up to the first bare `]`
        // stops inside the class and reports nothing, which is a check that cannot
        // fail. Verified by reverting the rule and watching this report it.
        const unbounded = line.match(/\[\^(?:\\.|[^\\\]])*\][*+]/g) || [];
        assert.deepStrictEqual(
            unbounded,
            [],
            `unbounded scans in ${file} citation rule: ${unbounded.join(', ')} - `
                + 'bound them with {0,N} or the tokenize goes quadratic again',
        );
    });

    ok(`${file}: the bound is large enough for a real locator`, () => {
        const bounds = [...line.matchAll(/\{0,(\d+)\}/g)].map((m) => Number(m[1]));
        assert.ok(bounds.length >= 2, `expected bounded scans in ${file}, found ${bounds.length}`);
        for (const bound of bounds) {
            assert.ok(
                bound >= 256,
                `${file} bounds a citation scan at ${bound}; a prefix or locator that long is `
                    + 'plausible and would stop being highlighted',
            );
        }
    });
}

console.log(`\n${passed} passed`);
