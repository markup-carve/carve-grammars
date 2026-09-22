/**
 * Run every `tests/*-test.js` file, several at a time.
 *
 * WHY THIS EXISTS. `npm test` was 68 `node tests/…` commands joined by `&&`,
 * so the suite was 68 sequential process launches, each loading the engine and
 * the corpus again. Measured on run 35649987298: `npm ci` took 5 to 8 seconds
 * and `Run tests` took 298, 309 and 396 seconds across the three Node legs. The
 * cost was never the work - it was doing all of it one file at a time on a
 * runner with several cores idle.
 *
 * WHY A POOL AND NOT `node --test`. The files are standalone scripts that
 * report by exit code, not `node:test` suites, so the built-in runner's
 * concurrency does not apply to them without rewriting all 70. A pool over the
 * same processes needs no test rewritten and keeps `node tests/<one>-test.js`
 * working as the way to run one by hand.
 *
 * WHAT IT REPORTS. Every failure, not the first: a suite that stops at the
 * first red file cannot say how big a breakage is, which is worst exactly at a
 * corpus bump when several things move at once. Output is buffered per file and
 * printed whole, so interleaving cannot shred a diff. The slowest files are
 * listed at the end, so the next change to this suite is measured rather than
 * guessed.
 *
 * THE FILE LIST IS A GLOB, not a hand-kept list, and it lives in
 * `scripts/test-files.mjs` so the guard inside each test file can ask the same
 * question this runner answers. The old list had drifted:
 * `tests/spec-citations-test.js` ran only as a separate CI step and
 * `tests/source-merge-test.js` only under `test:types`, so neither was in
 * `npm test`. A file that exists and is never run is worse than no file.
 *
 * Parallel is safe for this suite, checked before the change rather than
 * assumed: every test that writes goes through `mkdtempSync`, and
 * `snapshot-test.js` writes into the repository only under UPDATE_SNAPSHOTS=1,
 * which `snapshots:update` sets and which runs serially.
 *
 *   node scripts/run-tests.mjs                 # all files, one per core
 *   node scripts/run-tests.mjs --serial        # one at a time (clearer failures)
 *   node scripts/run-tests.mjs --jobs 4        # explicit width
 *   node scripts/run-tests.mjs roundtrip span  # only files matching a substring
 */

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

import { repoRoot, testDir, testFiles } from './test-files.mjs';

const argv = process.argv.slice(2);
const serial = argv.includes('--serial');
const jobsFlag = argv.indexOf('--jobs');
const filters = argv.filter((a, i) => !a.startsWith('--') && i !== jobsFlag + 1);

const width = serial
    ? 1
    : Number(
          jobsFlag === -1 ? process.env.CARVE_TEST_JOBS || availableParallelism() : argv[jobsFlag + 1],
      );

if (!Number.isInteger(width) || width < 1) {
    console.error(`run-tests: --jobs wants a positive integer, got ${JSON.stringify(argv[jobsFlag + 1])}`);
    process.exit(2);
}

const files = testFiles().filter(
    (f) => filters.length === 0 || filters.some((needle) => f.includes(needle)),
);

// A glob that matches nothing would otherwise pass as a green run of no tests.
if (files.length === 0) {
    console.error(
        filters.length
            ? `run-tests: no tests/*-test.js matched ${filters.join(', ')}`
            : 'run-tests: no tests/*-test.js found',
    );
    process.exit(2);
}

function run(file) {
    const started = Date.now();
    return new Promise((done) => {
        const child = spawn(process.execPath, [join(testDir, file)], {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const chunks = [];
        child.stdout.on('data', (c) => chunks.push(c));
        child.stderr.on('data', (c) => chunks.push(c));
        child.on('error', (error) => {
            chunks.push(Buffer.from(`run-tests: could not spawn ${file}: ${error.message}\n`));
            done({ file, code: 1, ms: Date.now() - started, output: Buffer.concat(chunks).toString('utf8') });
        });
        child.on('close', (code, signal) => {
            if (signal) {
                chunks.push(Buffer.from(`run-tests: ${file} was killed by ${signal}\n`));
            }
            done({
                file,
                code: signal ? 1 : (code ?? 1),
                ms: Date.now() - started,
                output: Buffer.concat(chunks).toString('utf8'),
            });
        });
    });
}

const queue = [...files];
const results = [];
const suiteStarted = Date.now();

async function worker() {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        const result = await run(file);
        results.push(result);
        const mark = result.code === 0 ? 'ok' : 'FAIL';
        process.stdout.write(
            `\n----- ${mark} ${result.file} (${(result.ms / 1000).toFixed(1)}s) -----\n${result.output}`,
        );
    }
}

await Promise.all(Array.from({ length: Math.min(width, files.length) }, worker));

const failed = results.filter((r) => r.code !== 0).sort((a, b) => a.file.localeCompare(b.file));
const elapsed = ((Date.now() - suiteStarted) / 1000).toFixed(1);

const slowest = [...results]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8)
    .map((r) => `  ${(r.ms / 1000).toFixed(1)}s  ${r.file}`)
    .join('\n');

process.stdout.write(
    `\n===== ${files.length} test files, ${failed.length} failed, ${elapsed}s wall clock` +
        ` at ${width} job${width === 1 ? '' : 's'} =====\n` +
        `slowest files:\n${slowest}\n`,
);

if (failed.length) {
    process.stdout.write(
        `\nfailed:\n${failed.map((r) => `  ${r.file} (exit ${r.code})`).join('\n')}\n` +
            `\nRe-run one with: node tests/<file>\n` +
            `Re-run the suite one file at a time with: npm run test:serial\n`,
    );
    process.exit(1);
}
