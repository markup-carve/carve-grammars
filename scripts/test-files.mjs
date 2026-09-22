/**
 * WHICH FILES ARE THE TEST SUITE. One definition, imported by the runner that
 * executes them and by the guard each test file uses to assert it is not dead.
 *
 * Before this existed, `npm test` was a hand-kept chain of 68 `node tests/…`
 * commands, and eleven test files carried their own assertion that the chain
 * named them - because a file missing from it never ran and looked exactly like
 * a file that did. The chain had already drifted twice:
 * `tests/spec-citations-test.js` ran only as a separate CI step and
 * `tests/source-merge-test.js` only under `test:types`, so neither was in
 * `npm test` and neither carried a guard to say so.
 *
 * A glob retires that whole class of defect: a file that matches runs, by
 * construction. What a glob cannot see is a file that does not match because it
 * was named `foo.test.js` or `foo-tests.js`, so the per-file guard stays and
 * asks THIS question instead - and asks it against the selection this module
 * performs, rather than against a string in package.json that only resembled
 * it.
 */

import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const testDir = join(repoRoot, 'tests');

/** The runner executes exactly the files whose basename satisfies this. */
export function isTestFile(name) {
    return name.endsWith('-test.js');
}

/** Every test file, sorted, so a run's order does not depend on the filesystem. */
export function testFiles() {
    return readdirSync(testDir).filter(isTestFile).sort();
}

/**
 * Files whose work is too big for one process, and how many slices to cut.
 *
 * `braced-scan-equivalence-test.js` sweeps 17.3 million generated strings and
 * was 174 of the 175 seconds the whole parallel suite took; on a 4-core runner
 * it starved instead, so spreading the OTHER files around it could not help
 * (carve-grammars#549). Slicing it is what makes the pool worth having.
 *
 * A file absent from here simply runs whole, so this table going stale costs
 * speed and never correctness - and `tests/slices-test.js` refuses an entry
 * that names a file which is gone or that does not take `--slice`.
 */
export const SLICED = {
    'braced-scan-equivalence-test.js': 4,
};

/**
 * What the runner actually executes: one entry per process, a sliced file
 * contributing one per slice.
 *
 * @returns {{file: string, args: string[], label: string}[]}
 */
export function testUnits() {
    return testFiles().flatMap((file) => {
        const slices = SLICED[file] ?? 1;
        if (slices === 1) {
            return [{ file, args: [], label: file }];
        }
        return Array.from({ length: slices }, (_, index) => ({
            file,
            args: ['--slice', `${index}/${slices}`],
            label: `${file} [slice ${index + 1}/${slices}]`,
        }));
    });
}
