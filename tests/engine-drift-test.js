/*
 * The engine-drift check must fail on the states it names, and pass on the
 * manifest this repo actually commits.
 *
 * WHY THIS TEST EXISTS. The rule it covers spent its whole life inside
 * `engine-drift.yml`, where nothing but the 05:00 schedule ever ran it - so the
 * repo had a nightly job asserting the engine must be a 40-hex git revision
 * while `tests/no-git-dependencies-test.js`, on every pull request, asserted
 * across 65 rows that it must NOT be. Two guards, opposite rules, and no test
 * that could see both: the scheduled one simply went red every night and was
 * read as upstream noise. Running the rule here puts it on every pull request
 * next to the guard it contradicted.
 *
 * The lag rows are the load-bearing half. A drift check that FAILS on lag is
 * the failure mode this repo already lived through - it goes red for a release
 * decision made in carve-js, people stop reading it, and the real conditions
 * underneath (a lockfile resolving over git, a version that was never
 * published) go unseen. So "120 commits behind exits ZERO" is asserted as
 * firmly as any rejection.
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const script = resolve(root, 'scripts/engine-drift.mjs');

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('carve-grammars engine-drift check:');

const scratch = mkdtempSync(join(tmpdir(), 'carve-grammars-drift-'));

/*
 * A real git repository standing in for carve-js: two commits on main with
 * `0.1.4` tagged at the first, so there is a genuine one-commit lag to measure,
 * plus a tag off main for the rewritten-branch row.
 */
const engine = join(scratch, 'engine');
function git(...args) {
    const run = spawnSync('git', ['-C', engine, ...args], { encoding: 'utf8' });
    assert.strictEqual(run.status, 0, `git ${args.join(' ')} failed: ${run.stdout}${run.stderr}`);
    return run.stdout.trim();
}
spawnSync('git', ['init', '-q', '-b', 'main', engine], { encoding: 'utf8' });
git('config', 'user.email', 'test@example.invalid');
git('config', 'user.name', 'Test');
writeFileSync(join(engine, 'a'), 'a', 'utf8');
git('add', '-A');
git('commit', '-qm', 'the released commit');
git('tag', '0.1.4');
writeFileSync(join(engine, 'b'), 'b', 'utf8');
git('add', '-A');
git('commit', '-qm', 'one commit past the release');
// The workflow reads `origin/main`, so the stand-in has to carry that ref too.
git('update-ref', 'refs/remotes/origin/main', 'HEAD');
// A tag that never reached main, for the rewritten-branch row.
git('checkout', '-q', '-b', 'stray', '0.1.4');
writeFileSync(join(engine, 'c'), 'c', 'utf8');
git('add', '-A');
git('commit', '-qm', 'never merged');
git('tag', '0.9.9');
git('checkout', '-q', 'main');

const baselineManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const baselineLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));

function run({ manifest = baselineManifest, lock = baselineLock, at = engine }) {
    const manifestPath = join(scratch, 'package.json');
    const lockPath = join(scratch, 'package-lock.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    writeFileSync(lockPath, JSON.stringify(lock, null, 2), 'utf8');
    const r = spawnSync(process.execPath, [script, at, manifestPath, lockPath], { encoding: 'utf8' });
    assert.notStrictEqual(r.status, null, 'the script was killed by a signal rather than exiting');
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const withEngine = (spec) => ({
    ...baselineManifest,
    dependencies: { ...baselineManifest.dependencies, '@markup-carve/carve': spec },
});

const withLock = (entry) => ({
    ...baselineLock,
    packages: { ...baselineLock.packages, 'node_modules/@markup-carve/carve': entry },
});

const registryEntry = (version) => ({
    version,
    resolved: `https://registry.npmjs.org/@markup-carve/carve/-/carve-${version}.tgz`,
    integrity: 'sha512-stand-in',
});

ok('accepts the manifest and lockfile committed here', () => {
    const { status, out } = run({ lock: withLock(registryEntry('0.1.4')) });
    assert.strictEqual(status, 0, `the check rejects this repo's own state:\n${out}`);
});

ok('reports lag without failing', () => {
    const { status, out } = run({ lock: withLock(registryEntry('0.1.4')) });
    assert.strictEqual(status, 0, `lag was gated rather than reported:\n${out}`);
    assert.match(out, /1 commit\(s\) ahead/, `the lag was not reported:\n${out}`);
    assert.match(out, /::warning::/, `the lag was not surfaced as a warning:\n${out}`);
});

ok('reports a released engine that is level with main without a warning', () => {
    // `0.1.4` re-tagged at the tip: the same code path, zero commits behind.
    const level = join(scratch, 'engine-level');
    spawnSync('git', ['clone', '-q', engine, level], { encoding: 'utf8' });
    spawnSync('git', ['-C', level, 'tag', '-f', '0.1.4', 'HEAD'], { encoding: 'utf8' });
    spawnSync('git', ['-C', level, 'update-ref', 'refs/remotes/origin/main', 'HEAD'], { encoding: 'utf8' });
    const { status, out } = run({ lock: withLock(registryEntry('0.1.4')), at: level });
    assert.strictEqual(status, 0, `a level engine failed:\n${out}`);
    assert.match(out, /0 commit\(s\) ahead/, `the zero lag was not reported:\n${out}`);
    assert.doesNotMatch(out, /::warning::/, `a level engine still warned:\n${out}`);
});

ok('rejects a git dependency, by delegating to the publish guard', () => {
    const { status, out } = run({
        manifest: withEngine('github:markup-carve/carve-js#61f824d'),
        lock: withLock(registryEntry('0.1.4')),
    });
    assert.notStrictEqual(status, 0, 'a git dependency passed the drift check');
    assert.match(out, /registry/i, `the report does not say why:\n${out}`);
    assert.match(out, /github:markup-carve\/carve-js#61f824d/, `the report does not quote the spec:\n${out}`);
});

ok('rejects a lockfile that resolves the engine over git', () => {
    // The half-migrated state: the manifest reads clean, so the publish guard
    // passes it, while CI here builds against a commit no consumer receives.
    const { status, out } = run({
        lock: withLock({
            version: '0.1.4',
            resolved: 'git+ssh://git@github.com/markup-carve/carve-js.git#61f824d',
        }),
    });
    assert.notStrictEqual(status, 0, 'a git-resolved lockfile passed the drift check');
    assert.match(out, /disagree/, `the report does not name the disagreement:\n${out}`);
});

ok('rejects a lockfile with no entry for the engine', () => {
    const packages = { ...baselineLock.packages };
    delete packages['node_modules/@markup-carve/carve'];
    const { status, out } = run({ lock: { ...baselineLock, packages } });
    assert.notStrictEqual(status, 0, 'a lockfile that pins no engine passed');
    assert.match(out, /no entry/, `the report does not name the missing entry:\n${out}`);
});

ok('rejects a version that was never released', () => {
    const { status, out } = run({ lock: withLock(registryEntry('9.9.9')) });
    assert.notStrictEqual(status, 0, 'an unreleased engine version passed');
    assert.match(out, /9\.9\.9/, `the report does not quote the version:\n${out}`);
    assert.match(out, /no matching tag/, `the report does not say what is missing:\n${out}`);
});

ok('rejects a release tag that is not on main', () => {
    const { status, out } = run({ lock: withLock(registryEntry('0.9.9')) });
    assert.notStrictEqual(status, 0, 'a tag off main passed');
    assert.match(out, /not on main/, `the report does not say why:\n${out}`);
});

ok('the workflow runs this script and not its own copy of the rule', () => {
    // The contradiction this whole file exists for: the workflow must not carry
    // the 40-hex commit-pin rule that the publish guard rejects by design.
    const workflow = readFileSync(resolve(root, '.github/workflows/engine-drift.yml'), 'utf8');
    assert.ok(
        workflow.includes('node scripts/engine-drift.mjs'),
        'engine-drift.yml does not call scripts/engine-drift.mjs',
    );
    assert.ok(
        !workflow.includes('[0-9a-f]{40}'),
        'engine-drift.yml still carries the 40-hex commit-pin rule the publish guard rejects',
    );
});

ok('the manifest satisfies the publish guard and the drift check at once', () => {
    // Stated as its own row because the pair is the invariant, not either half:
    // the repo had both guards green in isolation and contradicting each other.
    const publish = spawnSync(
        process.execPath,
        [resolve(root, 'scripts/no-git-dependencies.mjs'), resolve(root, 'package.json')],
        { encoding: 'utf8' },
    );
    assert.strictEqual(publish.status, 0, `the publish guard rejects the committed manifest:\n${publish.stdout}${publish.stderr}`);
    const drift = run({ lock: withLock(registryEntry('0.1.4')) });
    assert.strictEqual(drift.status, 0, `the drift check rejects the committed manifest:\n${drift.out}`);
});

ok('is named in the test script, so it is not dead on arrival', () => {
    assert.ok(
        baselineManifest.scripts.test.includes('node tests/engine-drift-test.js'),
        'tests/engine-drift-test.js is not in the test script chain',
    );
});

rmSync(scratch, { recursive: true, force: true });

console.log(`\n${passed} passed`);
