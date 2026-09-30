/*
 * THE RUNNER SELECTS THE FILES IT WAS ASKED FOR.
 *
 * `node scripts/run-tests.mjs roundtrip` ran all seventy files. The filter list
 * was built as `argv.filter((a, i) => !a.startsWith('--') && i !== jobsFlag + 1)`,
 * and with no `--jobs` on the line `indexOf` answers `-1`, so `jobsFlag + 1` is
 * `0` and the first positional was dropped as though it were the flag's value.
 * The example in that file's own header, `run-tests.mjs roundtrip span`,
 * therefore filtered on `span` alone (carve-grammars#591).
 *
 * WHY THIS TESTS THE FUNCTION AND NOT THE PROCESS. Spawning the runner to watch
 * it select one file would, against the broken version, run the whole suite
 * inside a test - minutes, and this file among them. The defect is entirely in
 * which strings survive the filter, so that is what is measured.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { filtersFrom } from '../scripts/test-files.mjs';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('the runner keeps the filters it was given:');

const ROWS = [
    // The regression. Every one of these returned one fewer filter than it was
    // given, and the first row returned none at all.
    [['roundtrip'], ['roundtrip']],
    [['roundtrip', 'span'], ['roundtrip', 'span']],
    [['--serial', 'roundtrip'], ['roundtrip']],
    [['--serial'], []],
    [[], []],
    // `--jobs` still has its value withheld, from either side of the line.
    [['--jobs', '4', 'roundtrip'], ['roundtrip']],
    [['roundtrip', '--jobs', '4'], ['roundtrip']],
    [['--jobs', '4'], []],
    [['--serial', '--jobs', '2', 'span', 'table'], ['span', 'table']],
    // A filter that looks like a number is still a filter when it is not the
    // value of `--jobs`.
    [['4'], ['4']],
];

for (const [argv, want] of ROWS) {
    ok(`${JSON.stringify(argv)} -> ${JSON.stringify(want)}`, () => {
        assert.deepStrictEqual(filtersFrom(argv), want);
    });
}

ok('the runner uses this function rather than its own copy of the rule', () => {
    // The fix is worth nothing if run-tests.mjs still carries the expression it
    // replaced, so both halves are pinned: the call is there and the old
    // expression is gone.
    const runner = new URL('../scripts/run-tests.mjs', import.meta.url);
    const source = readFileSync(runner, 'utf8');
    assert.ok(source.includes('filtersFrom(argv)'), 'run-tests.mjs does not call filtersFrom');
    assert.ok(
        !source.includes('i !== jobsFlag + 1'),
        'run-tests.mjs still carries the off-by-one filter this function replaced',
    );
});

ok('this file is part of the suite npm test runs', () => {
    assertThisFileRuns(import.meta.url);
});

console.log(`\n${passed} passed`);
