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
const UNBOUNDED = /\[\^(?:\\.|[^\\\]])*\][*+](?!\?)/g;
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

console.log(`\n${passed} passed`);
