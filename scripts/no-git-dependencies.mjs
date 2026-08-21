#!/usr/bin/env node
// Refuse a dependency that a consumer of this package cannot resolve from the
// registry.
//
//   node scripts/no-git-dependencies.mjs [package.json]
//
// npm re-resolves a published package's dependency SPECS from the tarball's own
// manifest - the lockfile committed here is not consulted downstream - so a
// git spec in `dependencies` means every install clones over git. Three
// consequences, all borne by the consumer: the install needs git and GitHub
// reachability (and resolves over SSH wherever an `insteadOf` rewrite is
// configured), npm has no registry tarball to check an integrity hash against,
// and a commit pin stops tracking the engine's releases, so a consumer on a
// caret range still cannot receive an engine fix.
//
// This is a REGRESSION guard. 0.1.4 shipped with the engine pinned to a carve-js
// commit and nothing noticed, because the manifest was never inspected before
// publishing (#274). #276 added the first version of this check.
//
// DETECTION IS BY WHAT A SPEC IS NOT, not by a list of the git spellings, and
// that inversion is the whole point (#293). The list is where the check leaks:
// the org has now had this regression in three spellings - `git+https://` in
// pandoc-carve, `github:` in carve-lsp, and npm's bare `owner/repo#ref`
// shorthand, which carries no protocol at all and so reads clean to any prefix
// test. A registry range is semver plus at most a dist-tag: it never contains a
// slash and never carries a protocol, with `npm:` the one alias that
// legitimately does.
//
// `dependencies`, `optionalDependencies` and `peerDependencies` are all
// inspected, because those are the three a consumer installs. `optionalDependencies`
// was the second hole: npm FETCHES an optional dependency like any other and
// only tolerates its failure afterwards, so a git spec there costs the consumer
// the same clone and the same missing integrity check. A git `devDependency`
// costs a contributor a clone and costs a consumer nothing, so it is left alone.
//
// Lifted from markup-carve/pandoc-carve#130 and markup-carve/carve-lsp#122,
// which landed this shape first.

import { readFileSync } from 'node:fs';

const manifestPath = process.argv[2] ?? 'package.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const NON_REGISTRY_PROTOCOL =
    /^(github|gitlab|bitbucket|gist|git|git\+[a-z.+-]+|ssh|https?|file|link|portal|workspace):/i;

const FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

// user@host:path, npm's SCP-style git URL. It carries no protocol, and when the
// repository sits at the root of its host it carries no slash either
// (`git@example.com:repo.git`), so neither test below sees it. `npm-package-arg`
// classifies that value as `git`. Named separately from the catch-all only so
// the report says what it actually is.
const SCP_STYLE = /^[^\s@/:]+@[^\s@/:]+:/;

// A registry range is semver plus at most a dist-tag. None of these characters
// appears in one, so anything carrying them is something else.
const NEVER_IN_A_RANGE = ['/', ':', '@'];

/** Why a consumer's npm could not satisfy this spec from the registry, or null. */
function offendingReason(spec) {
    if (typeof spec !== 'string') return 'is not a string';
    const value = spec.trim();
    // `npm:` is the one alias form that still resolves from the registry, and
    // the only legitimate reason a spec carries a protocol, a slash or an `@`.
    if (value.startsWith('npm:')) return null;
    const protocol = value.match(NON_REGISTRY_PROTOCOL);
    if (protocol) return `resolves over ${protocol[1].toLowerCase()}, not the registry`;
    if (SCP_STYLE.test(value)) return 'is an scp-style git URL (user@host:path), not a registry range';
    if (value.includes('/')) return 'is a git shorthand (owner/repo), not a registry range';
    // The catch-all, and the reason this is an inversion rather than a longer
    // list: whatever spelling comes next, it is not a semver range, and it does
    // not have to be anticipated to be caught.
    const stray = NEVER_IN_A_RANGE.find((c) => value.includes(c));
    if (stray) return `contains ${JSON.stringify(stray)}, which no registry range does`;
    return null;
}

const offenders = [];
for (const field of FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        const reason = offendingReason(spec);
        if (reason) offenders.push({ field, name, spec, reason });
    }
}

if (offenders.length > 0) {
    console.error(
        `::error::${offenders.length} dependency spec(s) would not resolve from the registry `
        + 'for a consumer of this package:',
    );
    for (const { field, name, spec, reason } of offenders) {
        console.error(`  ${field}.${name} -> ${spec}`);
        console.error(`    ${reason}`);
    }
    console.error(
        'A consumer would need git at install time and gets no registry integrity check. '
        + 'Declare a published version instead.',
    );
    process.exit(1);
}

const counted = FIELDS.reduce((n, field) => n + Object.keys(manifest[field] ?? {}).length, 0);
console.log(`all ${counted} runtime, optional and peer dependencies resolve from the registry`);
