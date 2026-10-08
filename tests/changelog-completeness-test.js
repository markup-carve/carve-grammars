/*
 * The release gate must be able to see an incomplete set of notes.
 *
 * WHY THIS TEST EXISTS AT ALL. `scripts/changelog-completeness.mjs` runs on a
 * `v*` tag push and nowhere else, so without this file its logic would only ever
 * execute during a release - the one moment where discovering a broken gate is
 * most expensive. That is the same reason `tests/no-git-dependencies-test.js`
 * exists, and the same reason the check it replaces was worth nothing: the old
 * `grep -qE "^## \[?<version>\]?"` had never been seen to fail, because it
 * cannot. Reconstructing this repository's pre-cut 0.1.10 section and renaming
 * its heading passes that grep while the section describes none of #569, #570,
 * #572, #581, #582 or #583.
 *
 * BOTH DIRECTIONS. A section that accounts for every shipped-source merge has to
 * exit zero, and one missing a merge has to exit non-zero AND name the number
 * and the title. A gate stuck at "always pass" and a gate stuck at "always fail"
 * therefore each fail here.
 *
 * THE ACCEPT ROWS ARE THE LOAD-BEARING HALF. The failure mode of a gate like
 * this is over-demanding: a merge that only touched `tests/`, only the README, or
 * only the version in `package.json` reaches a consumer's tarball or not, but it
 * changes no behavior and earns no changelog entry. A gate that demands one
 * contradicts the changelog rule it is meant to enforce, and the next person who
 * hits it switches it off.
 *
 * THE FIXTURE REPOSITORY IS SYNTHETIC. Its history is built here under
 * `mkdtemp`, with an identity written into that throwaway checkout's own config
 * because a runner has no global one. Nothing in it is ever pushed.
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { TARBALL_WITHOUT_BEHAVIOR, isShipped, shippedPrefixes } from '../scripts/shipped-paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const gate = resolve(root, 'scripts/changelog-completeness.mjs');
const SLUG = 'fixture-owner/fixture-repo';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('carve-grammars changelog completeness gate:');

// ---------------------------------------------------------------------------
// A fixture repository whose shipped directories are `alpha/` and `beta/`.

const scratch = mkdtempSync(join(tmpdir(), 'carve-grammars-changelog-'));
const repo = join(scratch, 'repo');
mkdirSync(repo);

const git = (...args) => {
    const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.strictEqual(run.status, 0, `git ${args.join(' ')} failed:\n${run.stdout}${run.stderr}`);
    return run.stdout.trim();
};

const write = (path, text) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text, 'utf8');
};

/** One commit touching one file, with `subject`. */
const commit = (path, subject) => {
    write(path, `${subject}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', subject);
};

git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Fixture');
git('config', 'user.email', 'fixture@example.invalid');

const manifest = (version) => `${JSON.stringify({
    name: 'fixture',
    version,
    files: ['alpha/', 'beta/', 'README.md', 'LICENSE'],
}, null, 2)}\n`;

write('package.json', manifest('0.1.0'));
write('README.md', 'fixture\n');
write('LICENSE', 'fixture\n');
write('alpha/a.js', 'alpha\n');
write('beta/b.js', 'beta\n');
write('CHANGELOG.md', '# Changelog\n');
git('add', '-A');
git('commit', '-q', '-m', 'initial');
git('tag', 'v0.1.0');

commit('alpha/a.js', 'fix: an alpha thing (#10)');
commit('beta/b.js', 'fix: a beta thing (#11)');
commit('tests/t.js', 'test: more coverage (#12)');
commit('README.md', 'docs: streamline the readme (#13)');
commit('docs/notes.md', 'docs: a note nobody ships (#16)');
commit('alpha/a.js', 'fix: a shipped change with no pull request');
commit('alpha/a.js', 'fix: a thing tracked as an issue (#15)');
// `package.json` is in every tarball and the cut commit touches it, so counting
// it would make every release demand an entry for its own version bump.
write('package.json', manifest('0.2.0'));
git('add', '-A');
git('commit', '-q', '-m', 'chore: cut 0.2.0 (#14)');

const closesMap = join(scratch, 'closes.json');
writeFileSync(closesMap, JSON.stringify({ 15: [99] }), 'utf8');

/**
 * Commit `section` as the 0.2.0 section and run the real gate over it.
 *
 * @param {string|undefined} section the section body, or undefined for no section
 * @param {string[]} extra further arguments
 */
function runOverChangelog(section, extra = []) {
    const text = section === undefined
        ? '# Changelog\n'
        : `# Changelog\n\n## [0.2.0] - 2026-09-30\n${section}\n`;
    write('CHANGELOG.md', text);
    git('add', '-A');
    // `--allow-empty`: two rows may commit the same section, and a row that
    // changes nothing still has to be the revision the gate reads.
    git('commit', '-q', '--allow-empty', '-m', 'docs: rewrite the changelog for a fixture row');
    return runGate(extra);
}

function runGate(extra = []) {
    const run = spawnSync(
        process.execPath,
        [gate, '0.2.0', '--root', repo, '--repo', SLUG, '--closes', closesMap, ...extra],
        { cwd: repo, encoding: 'utf8' },
    );
    assert.strictEqual(run.error, undefined, `spawning the gate failed: ${run.error}`);
    assert.notStrictEqual(run.status, null, 'the gate was killed by a signal rather than exiting');
    return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

const bodyFile = (text) => {
    const path = join(scratch, 'body.md');
    writeFileSync(path, text, 'utf8');
    return path;
};

// ---------------------------------------------------------------------------
// The accept direction, and with it every path that must NOT be demanded.

ok('accepts a section that cites every shipped-source merge', () => {
    const { status, out } = runOverChangelog('\n### Fixed\n\n- alpha (#10), beta (#11), and the tracked one (#15).\n');
    assert.strictEqual(status, 0, `a complete section was rejected:\n${out}`);
    assert.ok(/accounts for all 3 shipped-source/.test(out), `the report does not say what it counted:\n${out}`);
});

ok('does not demand an entry for a tests-only, docs-only or version-bump merge', () => {
    // Asserted on the passing row above: #12 (tests/), #13 (README.md),
    // #16 (docs/) and #14 (package.json) are cited nowhere and it still passes.
    const { status, out } = runOverChangelog('\n### Fixed\n\n- alpha (#10), beta (#11), tracked (#15).\n');
    assert.strictEqual(status, 0, out);
    for (const n of ['#12', '#13', '#14', '#16']) {
        assert.ok(!out.includes(`::error::${n}`), `the gate demanded an entry for ${n}:\n${out}`);
    }
});

ok('reports a shipped change that carries no pull request without failing', () => {
    const { status, out } = runOverChangelog('\n### Fixed\n\n- alpha (#10), beta (#11), tracked (#15).\n');
    assert.strictEqual(status, 0, out);
    assert.ok(
        /::notice::[0-9a-f]{9} touched shipped source with no pull request/.test(out),
        `the unattributed commit was not reported:\n${out}`,
    );
});

ok('accepts a citation of the issue a pull request closes', () => {
    const { status, out } = runOverChangelog('\n### Fixed\n\n- alpha (#10), beta (#11), and the issue (#99).\n');
    assert.strictEqual(status, 0, `#15 was not accepted under the issue it closes:\n${out}`);
});

ok('accepts a reference qualified to this repository', () => {
    const { status, out } = runOverChangelog(
        `\n### Fixed\n\n- alpha (#10), beta (${SLUG}#11), tracked (#15).\n`,
    );
    assert.strictEqual(status, 0, `a self-qualified reference was not read as a citation:\n${out}`);
});

// ---------------------------------------------------------------------------
// The reject direction. Non-zero alone would also come from a crash, so each row
// asserts the report names what it found.

ok('refuses a section missing one shipped-source merge', () => {
    const { status, out } = runOverChangelog('\n### Fixed\n\n- alpha (#10), tracked (#15).\n');
    assert.notStrictEqual(status, 0, `a section missing #11 passed:\n${out}`);
    assert.ok(out.includes('::error::#11'), `the report does not name #11:\n${out}`);
    assert.ok(out.includes('a beta thing'), `the report does not carry #11's title:\n${out}`);
    assert.ok(!out.includes('::error::#10'), `the report blames #10, which is cited:\n${out}`);
    assert.ok(/1 of 3 pull request\(s\) since v0\.1\.0/.test(out), `the summary does not count:\n${out}`);
});

ok('refuses a section whose only reference points at another repository', () => {
    const { status, out } = runOverChangelog(
        '\n### Fixed\n\n- alpha (#10), beta (other-owner/other-repo#11), tracked (#15).\n',
    );
    assert.notStrictEqual(status, 0, `a foreign-qualified reference was read as a citation:\n${out}`);
    assert.ok(out.includes('::error::#11'), `the report does not name #11:\n${out}`);
});

ok('refuses when the section is absent', () => {
    const { status, out } = runOverChangelog(undefined);
    assert.notStrictEqual(status, 0, `a missing section passed:\n${out}`);
    assert.ok(/no '## \[0\.2\.0\]' section/.test(out), `the report does not say the section is missing:\n${out}`);
});

ok('refuses an empty section', () => {
    const { status, out } = runOverChangelog('\n');
    assert.notStrictEqual(status, 0, `an empty section passed:\n${out}`);
    assert.ok(/section is empty/.test(out), `the report does not say the section is empty:\n${out}`);
});

// ---------------------------------------------------------------------------
// `--body-file`: the same question asked of a release draft, which is written by
// hand before the cut and goes stale exactly as the section does.

ok('refuses release notes that are empty', () => {
    runOverChangelog('\n### Fixed\n\n- alpha (#10), beta (#11), tracked (#15).\n');
    const { status, out } = runGate(['--body-file', bodyFile('   \n\n')]);
    assert.notStrictEqual(status, 0, `empty release notes passed:\n${out}`);
    assert.ok(/release notes for 0\.2\.0 are empty/.test(out), `the report does not say why:\n${out}`);
});

ok('refuses release notes missing a shipped-source merge', () => {
    const { status, out } = runGate(['--body-file', bodyFile('### Fixed\n\n- alpha (#10), tracked (#15).\n')]);
    assert.notStrictEqual(status, 0, `incomplete release notes passed:\n${out}`);
    assert.ok(out.includes('::error::#11'), `the report does not name #11:\n${out}`);
    assert.ok(/0\.2\.0 release notes/.test(out), `the report does not say it judged the notes:\n${out}`);
});

ok('accepts release notes that account for every shipped-source merge', () => {
    const { status, out } = runGate([
        '--body-file',
        bodyFile('### Fixed\n\n- alpha (#10), beta (#11), tracked (#15).\n'),
    ]);
    assert.strictEqual(status, 0, `complete release notes were rejected:\n${out}`);
});

// ---------------------------------------------------------------------------
// The escape hatch, and its own guard.

ok('exempts a merge whose exemption carries a reason, and prints it', () => {
    write('.changelog-exempt', '# a comment\n11: reverted before the tag, so there is nothing to describe\n');
    const { status, out } = runOverChangelog('\n### Fixed\n\n- alpha (#10), tracked (#15).\n');
    assert.strictEqual(status, 0, `an exempted merge still failed the gate:\n${out}`);
    assert.ok(out.includes('exempt: #11'), `an applied exemption is invisible on a passing run:\n${out}`);
    assert.ok(out.includes('reverted before the tag'), `the reason is not printed:\n${out}`);
    assert.ok(/1 exempt/.test(out), `the summary does not count the exemption:\n${out}`);
});

ok('refuses an exemption with no reason', () => {
    write('.changelog-exempt', '11\n');
    const { status, out } = runOverChangelog('\n### Fixed\n\n- alpha (#10), tracked (#15).\n');
    assert.notStrictEqual(status, 0, `a bare number was accepted as an exemption:\n${out}`);
    assert.ok(/expected '<number>: <reason>'/.test(out), `the report does not say what it wanted:\n${out}`);
    rmSync(join(repo, '.changelog-exempt'));
});

// ---------------------------------------------------------------------------
// The shipped set is a claim about the tarball, so hold it to the tarball.

ok('every file npm would pack is either shipped source or named as behavior-free', () => {
    const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(pack.status, 0, `npm pack --dry-run failed:\n${pack.stderr}`);
    const entries = JSON.parse(pack.stdout)[0].files.map((f) => f.path);
    assert.ok(entries.length > 1, 'npm pack reported no files');
    const prefixes = shippedPrefixes(root);
    const unclassified = entries.filter((p) => !isShipped(p, prefixes) && !TARBALL_WITHOUT_BEHAVIOR.has(p));
    assert.deepStrictEqual(
        unclassified,
        [],
        'these files reach a consumer and the completeness gate would never demand an entry for them; '
        + 'add the directory to package.json "files" or name the file in TARBALL_WITHOUT_BEHAVIOR',
    );
    // And the other direction: a prefix that packs nothing is a stale claim.
    for (const prefix of prefixes) {
        assert.ok(
            entries.some((p) => p.startsWith(prefix)),
            `package.json "files" lists ${prefix} but the tarball carries nothing under it`,
        );
    }
});

ok('the release workflow gates before the tag exists, behind an approval', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
    assert.ok(
        workflow.includes('node scripts/changelog-completeness.mjs'),
        'release.yml does not call scripts/changelog-completeness.mjs',
    );

    // The tag must NOT be the trigger. Packagist is pull-based: it reads this
    // repository's tags and serves the new stable version within minutes, with no
    // approval in that path. So on a tag-triggered workflow every gate runs after
    // the only irreversible act. v0.1.12 was tagged, Packagist served it in two
    // minutes, the gates then refused it over four uncited merges, the npm publish
    // was skipped, and the version could not be corrected because a published
    // source reference is immutable - 0.1.13 had to supersede identical code.
    assert.ok(
        !/\n {2}push:\n(?: {4}.*\n| *\n)*? {4}tags:/.test(workflow),
        'release.yml is triggered by a tag push, so its gates run after Packagist has already published',
    );
    assert.ok(
        /\n {2}workflow_dispatch:/.test(workflow),
        'release.yml is not dispatchable, so there is no way to gate before the tag',
    );

    // `needs:` is what makes a job unreachable rather than merely later. A check
    // ahead of a publish STEP in the same job is the shape that shipped a
    // vulnerable carve-py: the check failed, the step was skipped, the job went
    // green. So the tag job, which is the first irreversible step now, carries
    // both gates and the approval environment.
    const tagJob = /\n {2}tag:\n(?: {4}.*\n| *\n)*/.exec(workflow)?.[0] ?? '';
    assert.ok(tagJob, 'release.yml has no tag job');
    assert.ok(
        /needs:\s*\[[^\]]*guard[^\]]*\]/.test(tagJob),
        'the tag job does not declare needs: [guard, ...], so a tag can be created without the manifest gate',
    );
    assert.ok(
        /needs:\s*\[[^\]]*release-notes[^\]]*\]/.test(tagJob),
        'the tag job does not declare needs: [..., release-notes], so a tag can be created without the notes gate',
    );
    assert.ok(
        /environment:\s*release/.test(tagJob),
        'the tag job does not declare environment: release, so the tag would be created without an approval',
    );

    // And the publish stays behind the tag, so it cannot run on an untagged tree.
    const publishJob = /\n {2}publish:\n(?: {4}.*\n| *\n)*/.exec(workflow)?.[0] ?? '';
    assert.ok(publishJob, 'release.yml has no publish job');
    assert.ok(
        /needs:\s*\[[^\]]*tag[^\]]*\]/.test(publishJob),
        'the publish job does not declare needs: [tag, ...]',
    );
});

ok('this file is part of the suite npm test runs', () => {
    assertThisFileRuns(import.meta.url);
});

rmSync(scratch, { recursive: true, force: true });

console.log(`\n${passed} passed`);
