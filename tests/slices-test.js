/**
 * THE SLICE TABLE HAS TO STAY TRUE, because nothing else notices when it stops.
 *
 * `scripts/test-files.mjs` names the files the runner cuts into slices. A file
 * absent from that table runs whole, so a stale entry costs speed rather than
 * correctness - but two stale shapes are worse than slow:
 *
 * - An entry naming a file that was renamed or deleted. `testUnits()` would
 *   expand nothing for it and the table would quietly describe a file that is
 *   not there.
 * - An entry naming a file that does NOT read `--slice`. The runner would start
 *   four processes, each ignoring the flag and running the whole sweep, so the
 *   suite would do the work four times over and still pass.
 *
 * The second is the one worth a test: it is invisible in a green run and it
 * makes the thing slower, which is the opposite of what the table is for.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SLICED, testDir, testFiles, testUnits } from '../scripts/test-files.mjs';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('the slice table describes files that exist and take slices:');

ok('every sliced file is a test file the runner selects', () => {
    const files = testFiles();
    for (const name of Object.keys(SLICED)) {
        assert.ok(
            files.includes(name),
            `${name} is in SLICED but is not one of the ${files.length} test files - renamed or deleted?`,
        );
    }
});

ok('every sliced file reads the --slice argument', () => {
    for (const name of Object.keys(SLICED)) {
        const source = readFileSync(join(testDir, name), 'utf8');
        assert.ok(
            source.includes('--slice'),
            `${name} is sliced ${SLICED[name]} ways but never reads --slice, so each slice would run the whole file`,
        );
    }
});

ok('a slice count is an integer above one', () => {
    for (const [name, count] of Object.entries(SLICED)) {
        assert.ok(
            Number.isInteger(count) && count > 1,
            `${name}: a slice count of ${count} either does nothing or is not a count`,
        );
    }
});

ok('the units expand to one process per slice', () => {
    const units = testUnits();
    const expected = testFiles().reduce((total, file) => total + (SLICED[file] ?? 1), 0);
    assert.equal(units.length, expected);

    for (const [name, count] of Object.entries(SLICED)) {
        const mine = units.filter((u) => u.file === name);
        assert.equal(mine.length, count, `${name} expanded to ${mine.length} units, not ${count}`);
        assert.deepEqual(
            mine.map((u) => u.args.join(' ')),
            Array.from({ length: count }, (_, i) => `--slice ${i}/${count}`),
            `${name}: the slice arguments do not cover 0..${count - 1} exactly once`,
        );
    }
});

ok('an unsliced file runs as exactly one unit with no arguments', () => {
    const plain = testFiles().filter((f) => !(f in SLICED));
    const units = testUnits();
    for (const file of plain) {
        const mine = units.filter((u) => u.file === file);
        assert.equal(mine.length, 1, `${file} expanded to ${mine.length} units`);
        assert.deepEqual(mine[0].args, []);
        assert.equal(mine[0].label, file);
    }
});

ok('this file is part of the suite npm test runs', () => {
    assertThisFileRuns(import.meta.url);
});

console.log(`\n${passed} passed`);
