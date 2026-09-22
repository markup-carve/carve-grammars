/**
 * IS THIS TEST FILE ACTUALLY RUN? The assertion eleven test files carry, in one
 * place, asking the question that can still go wrong.
 *
 * It used to be "does package.json's `test` chain contain `node tests/<me>.js`",
 * because the chain was hand-kept and a file missing from it never ran while
 * looking exactly like a file that did. `npm test` now globs, so that defect is
 * gone by construction - but a NEW one takes its place: a file the glob does not
 * match. `foo.test.js`, `foo-tests.js` or a file parked outside `tests/` is
 * silently not a test, with no chain to be missing from.
 *
 * So the guard asks the selection itself, through the module the runner uses, in
 * two parts: `npm test` still goes through that runner, and the runner's own
 * file list includes this file. Checking the second alone would pass on a repo
 * whose `test` script no longer runs the suite at all.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoRoot, testFiles } from '../../scripts/test-files.mjs';

/**
 * Assert that the calling test file is part of the suite `npm test` runs.
 *
 * @param {string} importMetaUrl the caller's `import.meta.url`
 */
export function assertThisFileRuns(importMetaUrl) {
    const self = basename(fileURLToPath(importMetaUrl));
    const pkg = JSON.parse(readFileSync(`${repoRoot}/package.json`, 'utf8'));

    assert.ok(
        pkg.scripts.test.includes('scripts/run-tests.mjs'),
        `package.json "test" no longer runs scripts/run-tests.mjs, so nothing here says what the suite is`,
    );
    assert.ok(
        testFiles().includes(self),
        `${self} is not in the runner's file list, so it never runs - the runner takes tests/*-test.js`,
    );
}
