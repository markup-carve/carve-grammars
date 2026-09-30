/**
 * WHAT COUNTS AS SHIPPED SOURCE. One definition, imported by the changelog
 * completeness gate that judges merges by it and by the test that reconciles it
 * against the tarball npm would actually publish.
 *
 * The set is derived from `package.json`'s `files` rather than hand-listed, so
 * adding a shipped directory extends the gate by construction. Only DIRECTORY
 * entries count: `files` also names `README.md` and `LICENSE`, and npm adds
 * `package.json` whatever `files` says. Those three reach a consumer and change
 * no behavior, so demanding a changelog line for them would contradict the rule
 * that docs-only and version-bump changes get no entry, and a gate that cries
 * wolf is one somebody switches off.
 *
 * A root-level shipped file would slip through that rule, which is why
 * `tests/changelog-completeness-test.js` holds every entry of
 * `npm pack --dry-run` to being either shipped source or one of the three named
 * below. A new one fails that test until someone classifies it.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** In every tarball, and carrying no behavior of its own. */
export const TARBALL_WITHOUT_BEHAVIOR = new Set(['README.md', 'LICENSE', 'package.json']);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The directory prefixes `files` puts in the tarball, each with its trailing
 * slash, sorted so a report reads the same way twice.
 *
 * @param {string} [root] the checkout to read; defaults to this one
 * @returns {string[]}
 */
export function shippedPrefixes(root = repoRoot) {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    return (pkg.files ?? [])
        .filter((entry) => entry.endsWith('/'))
        .map((entry) => entry.replace(/^\.?\//, ''))
        .sort();
}

/**
 * Does this repository-relative path carry shipped behavior?
 *
 * @param {string} path
 * @param {string[]} [prefixes]
 * @returns {boolean}
 */
export function isShipped(path, prefixes = shippedPrefixes()) {
    return prefixes.some((prefix) => new RegExp(`^${escape(prefix)}`).test(path));
}
