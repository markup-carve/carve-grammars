#!/usr/bin/env node
// Report how far the engine this repo builds against has fallen behind carve-js
// main, and refuse the states where that question has no honest answer.
//
//   node scripts/engine-drift.mjs <carve-js-checkout> [package.json] [package-lock.json]
//
// WHY THIS REPLACED A COMMIT-PIN CHECK. `engine-drift.yml` used to require
// `@markup-carve/carve` to be a 40-hex git revision, because that is what the
// dependency was when the workflow was written. It is not any more: 0.1.4
// shipped with a git pin, nobody noticed, and #276/#293/#299 moved the manifest
// to a published range and added `scripts/no-git-dependencies.mjs` plus
// `tests/no-git-dependencies-test.js` to keep it there.
//
// That left two guards in one repo asserting opposite things. The manifest
// says `^0.1.4`; the git-pin rule failed it every night with "it must pin a
// 40-hex revision", and the only manifest that could have satisfied it is the
// one the publish guard and its 65 test rows exist to reject. A scheduled job
// that cannot pass on a correct repository is not a drift check - it is noise
// that teaches people to skip the tab, which is how it went unread long enough
// for the engine to fall 120 commits behind without anyone acting on it.
//
// WHAT FAILS AND WHAT IS REPORTED, kept deliberately in the same split the
// commit-pin version used:
//
// - LAG IS REPORTED, never gated. This repo cannot advance the engine on its
//   own - it consumes a PUBLISHED package, so the pin moves when carve-js cuts
//   a release and not before. Failing here would go red for a decision made in
//   another repository.
// - A SPEC A CONSUMER CANNOT RESOLVE FAILS, by delegating to the publish guard
//   rather than restating its rule. Both callers run the one script, which is
//   the property `tests/no-git-dependencies-test.js` already pins for
//   release.yml.
// - A LOCKFILE THAT DOES NOT RESOLVE FROM THE REGISTRY FAILS. This is the
//   half-migrated state the publish guard cannot see: it reads the manifest,
//   and a manifest can say `^0.1.4` while the lockfile still resolves the
//   engine over git, so every CI run here builds against a commit while a
//   consumer gets the registry tarball. The two disagreeing is exactly the
//   condition that makes a green tick here mean nothing downstream.
// - A VERSION THAT IS NOT A RELEASED carve-js FAILS. The lag number is
//   measured from the tag, so a version with no tag leaves nothing to measure
//   from, and a tag that is not an ancestor of main came from an unmerged or
//   rewritten branch. carve-js has rewritten history before - three sibling
//   repos pinned revisions a fresh clone could not check out (carve#499).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE = '@markup-carve/carve'
const LOCK_PATH = `node_modules/${ENGINE}`
const REGISTRY = 'https://registry.npmjs.org/'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const [enginePath, manifestArg, lockArg] = process.argv.slice(2)

if (!enginePath) {
    fail('usage: node scripts/engine-drift.mjs <carve-js-checkout> [package.json] [package-lock.json]')
}

const manifestPath = manifestArg ?? join(root, 'package.json')
const lockPath = lockArg ?? join(root, 'package-lock.json')

function fail(message) {
    console.error(`::error::${message}`)
    process.exit(1)
}

function readJson(path, what) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
        fail(`${what} at ${path} could not be read: ${error.message}`)
    }
}

function git(...args) {
    return spawnSync('git', ['-C', enginePath, ...args], { encoding: 'utf8' })
}

// 1. The spec has to be one a consumer can resolve. Delegated, not restated -
//    a second copy of that rule is how this repo grew two contradicting ones.
const guard = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'no-git-dependencies.mjs'), manifestPath],
    { encoding: 'utf8' },
)
if (guard.status !== 0) {
    process.stderr.write(`${guard.stdout ?? ''}${guard.stderr ?? ''}`)
    fail(`${manifestPath} declares a dependency a consumer cannot resolve from the registry`)
}

const manifest = readJson(manifestPath, 'the manifest')
const declared = manifest.dependencies?.[ENGINE]
if (!declared) fail(`${manifestPath} does not declare ${ENGINE} in dependencies`)

// 2. The lockfile is what CI actually builds against, so it - not the range -
//    names the engine every measurement in this repo was taken against.
const lock = readJson(lockPath, 'the lockfile')
const locked = lock.packages?.[LOCK_PATH]
if (!locked) fail(`${lockPath} has no entry for ${LOCK_PATH}, so nothing pins the engine CI builds against`)

const resolvedUrl = locked.resolved ?? ''
if (!resolvedUrl.startsWith(REGISTRY)) {
    fail(
        `${lockPath} resolves ${ENGINE} from ${JSON.stringify(resolvedUrl)}, not the npm registry - `
        + 'the manifest and the lockfile disagree, so CI here builds against something a consumer never gets',
    )
}

const version = locked.version
if (!version) fail(`${lockPath} entry for ${LOCK_PATH} carries no version`)

console.log(`engine: ${ENGINE} ${version} (declared ${declared}, locked from the registry)`)

// 3. The version has to be a real carve-js release, or there is no commit to
//    measure the lag from.
const tag = [version, `v${version}`].find((name) => git('rev-parse', '--verify', `${name}^{commit}`).status === 0)
if (!tag) {
    fail(
        `${ENGINE} ${version} has no matching tag in markup-carve/carve-js, `
        + 'so the engine this repo builds against is not a released one',
    )
}

if (git('merge-base', '--is-ancestor', tag, 'origin/main').status !== 0) {
    fail(`carve-js ${tag} is not on main, so the release came from an unmerged or rewritten branch`)
}

// 4. Lag: reported, never gated.
const count = git('rev-list', '--count', `${tag}..origin/main`)
if (count.status !== 0) fail(`could not count commits from ${tag} to origin/main: ${count.stderr.trim()}`)

const behind = Number(count.stdout.trim())
const subject = git('log', '-1', '--format=%s', tag).stdout.trim()
console.log(`carve-js ${tag} (${subject})`)
console.log(`carve-js main is ${behind} commit(s) ahead of the released engine`)

if (behind > 0) {
    console.log(
        `::warning::the engine is ${behind} commit(s) behind carve-js main; `
        + 'this repo advances when carve-js publishes, not before',
    )
}
