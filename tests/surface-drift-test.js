/*
 * The surface-drift check must fail on the states it names, and must NOT fail
 * on the one it exists to report.
 *
 * WHY THIS TEST EXISTS, and why it is not simply the script run over the real
 * checkouts. The six surfaces this rule is about live in other repositories and
 * are not there on a pull request - that absence is the whole reason their
 * ledger rows go stale unseen. So the rule is driven over a REAL git repository
 * built here, one commit at a time, which means the assertions are about the
 * rule rather than about whatever those six repositories happen to be today.
 *
 * THE LAG ROW IS THE LOAD-BEARING ONE. A drift check that FAILS on lag is a
 * failure mode this repository has already lived through: `engine-drift.yml`
 * carried a rule no correct manifest could satisfy, went red every night, was
 * read as upstream noise, and the engine fell 120 commits behind while the tab
 * went unread (carve-grammars#276/#293/#299). So "six commits behind exits
 * ZERO, and says so" is asserted as firmly as any rejection here.
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SURFACES } from '../scripts/surface-probe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const script = resolve(root, 'scripts/surface-drift.mjs');

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('carve-grammars surface-drift check:');

const scratch = mkdtempSync(join(tmpdir(), 'carve-grammars-surface-drift-'));

/*
 * A real git repository standing in for a surface: three commits on main, plus
 * a tip that never reached main for the unmerged-branch row.
 */
const surface = join(scratch, 'surface');
function git(...args) {
    const run = spawnSync('git', ['-C', surface, ...args], { encoding: 'utf8' });
    assert.strictEqual(run.status, 0, `git ${args.join(' ')} failed: ${run.stdout}${run.stderr}`);

    return run.stdout.trim();
}
spawnSync('git', ['init', '-q', '-b', 'main', surface], { encoding: 'utf8' });
git('config', 'user.email', 'test@example.invalid');
git('config', 'user.name', 'Test');
const commits = [];
for (const subject of ['the reading', 'one merge past it', 'two merges past it']) {
    writeFileSync(join(surface, subject.replace(/\s+/g, '-')), subject, 'utf8');
    git('add', '-A');
    git('commit', '-qm', subject);
    commits.push(git('rev-parse', '--short', 'HEAD'));
}
// The rule reads `origin/main`, so the stand-in has to carry that ref too.
git('update-ref', 'refs/remotes/origin/main', 'HEAD');
// A commit that never reached main, for the unmerged-branch row.
git('checkout', '-q', '-b', 'stray', commits[0]);
writeFileSync(join(surface, 'stray'), 'stray', 'utf8');
git('add', '-A');
git('commit', '-qm', 'never merged');
const stray = git('rev-parse', '--short', 'HEAD');
git('checkout', '-q', 'main');

const [oldest, , newest] = commits;

/** A ledger file carrying one row for `id`, written to a scratch path. */
function ledgerWith(id, record, name) {
    const path = join(scratch, `${name}.json`);
    writeFileSync(path, JSON.stringify({
        verbatimPayload: ['code_span'],
        surfaces: {
            [id]: {
                repo: SURFACES[id].repo,
                measured: '2026-08-21',
                constructs: { heading: { status: 'IMPLEMENTED', evidence: 'heading', payload: 'parsed' } },
                ...record,
            },
        },
    }, null, 2), 'utf8');

    return path;
}

/** Run the rule; returns its status and its combined output. */
function drift(id, ledgerPath, checkout = surface) {
    const run = spawnSync(process.execPath, [script, id, checkout, ledgerPath], { encoding: 'utf8' });

    return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

/*
 * WHAT IS REPORTED. Both rows below exit ZERO, and that is the point: a
 * surface moving is news about another repository, not a defect in this one.
 */
ok('a current reading passes and warns about nothing', () => {
    const run = drift('tree-sitter-carve', ledgerWith('tree-sitter-carve', { commit: newest }, 'current'));
    assert.strictEqual(run.status, 0, run.out);
    assert.match(run.out, /main is 0 commit\(s\) ahead/, run.out);
    assert.doesNotMatch(run.out, /::warning::/, `a current reading warned anyway: ${run.out}`);
});

ok('a stale reading passes, and says how far behind it is', () => {
    // The shape carve-grammars#334 was filed about: the ledger three commits
    // and two closed gaps behind the surface, and nothing here able to say so.
    const run = drift('tree-sitter-carve', ledgerWith('tree-sitter-carve', { commit: oldest }, 'stale'));
    assert.strictEqual(run.status, 0, `lag must not gate - it goes red for another repo's merge: ${run.out}`);
    assert.match(run.out, /main is 2 commit\(s\) ahead/, run.out);
    assert.match(run.out, /::warning::tree-sitter-carve was last read 2 commit\(s\) ago/, run.out);
    // ... and it names the command that fixes it, in the surface's own spelling.
    assert.match(run.out, /CARVE_SURFACE_TREE_SITTER_CARVE=<checkout>/, run.out);
});

/*
 * WHAT FAILS. Each row is a state in which "how far behind is this reading"
 * has no honest answer.
 */
const REFUSED = [
    ['a commit no clone can resolve', () => drift(
        'tree-sitter-carve',
        ledgerWith('tree-sitter-carve', { commit: '0123456' }, 'unknown-commit'),
    ), /not a commit in markup-carve\/tree-sitter-carve/],
    ['a commit that never reached main', () => drift(
        'tree-sitter-carve',
        ledgerWith('tree-sitter-carve', { commit: stray }, 'off-main'),
    ), /not on markup-carve\/tree-sitter-carve main/],
    ['a row with no recorded commit at all', () => drift(
        'tree-sitter-carve',
        ledgerWith('tree-sitter-carve', {}, 'no-commit'),
    ), /has no "commit" on the ledger/],
    ['a surface the ledger does not carry', () => drift(
        'emacs-carve',
        ledgerWith('tree-sitter-carve', { commit: newest }, 'other-surface'),
    ), /has no ledger for emacs-carve/],
    ['a surface that is not a surface', () => drift(
        'carve-mode-for-ed',
        ledgerWith('tree-sitter-carve', { commit: newest }, 'unknown-surface'),
    ), /is not a surface/],
    /*
     * The four grammars in THIS repository are re-probed against the shipped
     * files on every pull request (tests/construct-ledger-test.js), which is
     * strictly stronger than comparing a commit. Accepting one here would
     * report "0 behind" forever and read as coverage it is not.
     */
    ['a local surface, which a commit comparison would flatter', () => drift(
        'prism',
        ledgerWith('prism', { commit: newest }, 'local-surface'),
    ), /lives in this repository/],
    ['a ledger that cannot be read', () => drift(
        'tree-sitter-carve',
        join(scratch, 'does-not-exist.json'),
    ), /could not be read/],
];

for (const [what, run, expected] of REFUSED) {
    ok(`refuses ${what}`, () => {
        const result = run();
        assert.strictEqual(result.status, 1, `expected a refusal, got ${result.status}: ${result.out}`);
        assert.match(result.out, expected, result.out);
    });
}

/*
 * AND THE RULE HAS TO BE POINTED AT SOMETHING.
 *
 * A rule nothing runs is the failure this repo has shipped three times
 * (carve-grammars#295, #298, #300). Two things have to hold for this one to
 * mean anything: every remote surface carries a commit for the job to read,
 * and the job names every remote surface.
 */
const ledger = JSON.parse(readFileSync(resolve(here, 'lib', 'construct-ledger.json'), 'utf8'));
const remote = Object.keys(SURFACES).filter((id) => !SURFACES[id].local);

ok('every surface in another repository records the commit it was read at', () => {
    const missing = remote.filter((id) => !ledger.surfaces[id]?.commit);
    assert.deepStrictEqual(
        missing, [],
        `these surfaces have no "commit", so nothing says what their rows were read from: ${missing.join(', ')}`,
    );
});

ok('the scheduled job watches every surface in another repository', () => {
    const workflow = readFileSync(resolve(root, '.github', 'workflows', 'surface-drift.yml'), 'utf8');
    assert.ok(
        workflow.includes('node scripts/surface-drift.mjs'),
        'surface-drift.yml does not run scripts/surface-drift.mjs at all',
    );
    // The matrix entry is what makes the job run for a surface, so that is what
    // is read - one `- id:` per surface the ledger records from elsewhere.
    const inMatrix = (id) => new RegExp(`^\\s*- id: ${id}$`, 'm').test(workflow);
    const unwatched = remote.filter((id) => !inMatrix(id));
    assert.deepStrictEqual(
        unwatched, [],
        `.github/workflows/surface-drift.yml has no matrix entry for ${unwatched.join(', ')}, so those `
            + 'rows can go stale exactly the way carve-grammars#334 and #332 found them',
    );
    // ... and it does not claim to watch one that is re-probed here instead.
    const local = Object.keys(SURFACES).filter((id) => SURFACES[id].local).filter(inMatrix);
    assert.deepStrictEqual(
        local, [],
        `the job has a matrix entry for local surfaces, where the check always refuses: ${local.join(', ')}`,
    );
});

ok('this file is in the npm test chain', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const self = 'tests/surface-drift-test.js';
    assert.ok(
        pkg.scripts.test.includes(`node ${self}`),
        `package.json "test" does not run ${self}, so this file proves nothing in CI - `
            + 'the script is an explicit list, not a glob',
    );
});

console.log(`\n${passed} passed`);
