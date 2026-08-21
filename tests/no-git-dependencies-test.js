/*
 * The publish-time guard must detect a git dependency by what a spec IS NOT.
 *
 * WHY THIS TEST EXISTS AT ALL. The guard lives in `release.yml`, which runs on a
 * `v*` tag push and nowhere else, so until this file existed its logic was never
 * executed except during a release - the one moment where discovering a broken
 * guard is most expensive. Running the real script here puts it on every pull
 * request.
 *
 * WHY THE GUARD WAS REWRITTEN. The first version (#276) filtered on a list of
 * URL prefixes, `/^(github:|git\+|git:)/`, and so could not see two spellings of
 * the thing it exists to reject: npm's bare `owner/repo#ref` shorthand, which
 * carries no protocol at all, and anything at all in `optionalDependencies`,
 * which it never read. Both measured against this repo's own manifest, both
 * reported clean. That is a check that cannot fail on two thirds of its subject,
 * so the repo was clean by luck rather than by check (#293).
 *
 * The rows below are the acceptance table from markup-carve/carve-lsp#122 and
 * markup-carve/pandoc-carve#130, where the same holes were found first. The
 * `npm:` alias row is the near miss that keeps the rule from collapsing into
 * "reject anything with a slash" - an alias resolves from the registry, so
 * rejecting it would be an over-broad fix that breaks a legitimate manifest.
 *
 * Both directions are asserted. A rejection has to exit non-zero AND name the
 * field, the spec and a reason; an acceptance has to exit zero. A guard stuck at
 * "always pass" and a guard stuck at "always fail" therefore each fail here,
 * which is the property the previous version did not have.
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const guard = resolve(root, 'scripts/no-git-dependencies.mjs');
const manifestPath = resolve(root, 'package.json');

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('carve-grammars git-dependency guard:');

const baseline = JSON.parse(readFileSync(manifestPath, 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'carve-grammars-guard-'));

/* Run the REAL script against a manifest written to a scratch file. */
function runGuard(manifest) {
    const path = join(scratch, 'package.json');
    writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8');
    const run = spawnSync(process.execPath, [guard, path], { encoding: 'utf8' });
    assert.strictEqual(run.error, undefined, `spawning the guard failed: ${run.error}`);
    assert.notStrictEqual(run.status, null, 'the guard was killed by a signal rather than exiting');
    return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

const withDep = (spec) => ({
    ...baseline,
    dependencies: { ...baseline.dependencies, '@markup-carve/carve': spec },
});

/*
 * Each row: what the spec is, the manifest that carries it, and whether a
 * consumer's npm could install it from the registry.
 */
const MATRIX = [
    ['a github: pin', withDep('github:markup-carve/carve-js#61f824d'), 'reject'],
    [
        'a git+https:// pin',
        withDep('git+https://github.com/markup-carve/carve-js.git#61f824d'),
        'reject',
    ],
    [
        'a bare owner/repo#sha shorthand',
        withDep('markup-carve/carve-js#61f824d5d5724bfaa26dd07dc5c159249a66c977'),
        'reject',
    ],
    [
        'a git spec in optionalDependencies',
        { ...baseline, optionalDependencies: { 'some-tool': 'github:markup-carve/some-tool#abc123' } },
        'reject',
    ],
    // Found by `codex review` on this branch, and present in both repos this
    // script was lifted from: an SCP-style git URL carries no protocol, and when
    // the repository sits at the root of its host it carries no slash either, so
    // the version above this one accepted it. `npm-package-arg` calls it `git`.
    ['an scp-style git URL with no slash', withDep('git@example.com:repo.git'), 'reject'],
    ['an scp-style git URL', withDep('git@github.com:markup-carve/carve-js.git'), 'reject'],
    ['an exact version', withDep('0.1.4'), 'accept'],
    ['a caret range', withDep('^0.1.4'), 'accept'],
    ['a dist-tag', withDep('latest'), 'accept'],
    ['a compound range', withDep('>=0.1.4 <0.2.0'), 'accept'],
    ['a prerelease version', withDep('0.2.0-beta.1'), 'accept'],
    // The near miss. An alias contains a slash and still resolves from the
    // registry, so over-rejecting it would break a manifest that is fine.
    ['an npm: alias', withDep('npm:@markup-carve/carve@^0.1.4'), 'accept'],
];

for (const [label, manifest, verdict] of MATRIX) {
    ok(`${verdict}s ${label}`, () => {
        const { status, out } = runGuard(manifest);
        if (verdict === 'accept') {
            assert.strictEqual(status, 0, `the guard rejected ${label}, which installs fine:\n${out}`);
            return;
        }
        assert.notStrictEqual(status, 0, `the guard passed ${label}, which needs git at install time`);
        // A non-zero exit alone would also come from a crash, so the report has
        // to name what it found.
        const [field, spec] = Object.entries(manifest.optionalDependencies ?? {}).length
            ? ['optionalDependencies', Object.values(manifest.optionalDependencies)[0]]
            : ['dependencies', manifest.dependencies['@markup-carve/carve']];
        assert.ok(out.includes(field), `the report does not name the field it found it in:\n${out}`);
        assert.ok(out.includes(spec), `the report does not quote the offending spec:\n${out}`);
        assert.ok(/registry/i.test(out), `the report does not say why:\n${out}`);
    });
}

ok('accepts this repo\'s own manifest', () => {
    const run = spawnSync(process.execPath, [guard, manifestPath], { encoding: 'utf8' });
    assert.strictEqual(
        run.status,
        0,
        `the guard rejects the manifest that is committed here:\n${run.stdout}${run.stderr}`,
    );
});

ok('devDependencies are left alone', () => {
    // A contributor's git devDependency costs a consumer nothing, and rejecting
    // it would be the same over-reach the npm: row guards against.
    const { status } = runGuard({
        ...baseline,
        devDependencies: { ...baseline.devDependencies, something: 'github:someone/something#abc' },
    });
    assert.strictEqual(status, 0, 'a git devDependency was rejected; only installed fields are in scope');
});

ok('the release workflow runs this script and not its own copy of the rule', () => {
    // The guard is worth nothing if release.yml still carries the prefix list it
    // replaced, so both halves are pinned: the call is there and the old
    // expression is gone.
    const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
    assert.ok(
        workflow.includes('node scripts/no-git-dependencies.mjs'),
        'release.yml does not call scripts/no-git-dependencies.mjs',
    );
    assert.ok(
        !workflow.includes('github:|git'),
        'release.yml still carries the prefix-list filter this script replaced',
    );
});

ok('is named in the test script, so it is not dead on arrival', () => {
    // `test` is an explicit chain of `node tests/*.js` invocations, not a glob.
    // A file added without a link in that chain never runs and looks exactly
    // like one that does.
    assert.ok(
        baseline.scripts.test.includes('node tests/no-git-dependencies-test.js'),
        'tests/no-git-dependencies-test.js is not in the test script chain',
    );
});

rmSync(scratch, { recursive: true, force: true });

console.log(`\n${passed} passed`);
