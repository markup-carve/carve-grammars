#!/usr/bin/env node
// Report how far a GRAMMAR SURFACE's ledger row has fallen behind that
// surface's own main, and refuse the states where that question has no honest
// answer.
//
//   node scripts/surface-drift.mjs <surface-id> <checkout> [construct-ledger.json]
//
// WHY THIS EXISTS. `tests/lib/construct-ledger.json` gives every surface a
// `commit` and a `measured` date, written by `scripts/seed-construct-ledger.mjs`
// so that a recorded row says what it was read from. Until this script, NOTHING
// READ EITHER FIELD. `tests/construct-ledger-test.js` re-probes the four
// surfaces that live in this repository - `SURFACES[id].local` - on every pull
// request; the other six are records, and a record nothing compares is a claim
// that ages silently.
//
// It aged. carve-grammars#334 found `tree-sitter-carve` recorded at 863abfa
// with `admonition` and `figure_group` GAP, three commits after
// markup-carve/tree-sitter-carve#252 named both; carve-grammars#332 found
// `emacs-carve` three merges old with 24 gaps that were 2. Neither was
// detectable here - the suite was green the whole time, because a stale row
// contradicts nothing the suite reads.
//
// WHAT FAILS AND WHAT IS REPORTED, in the same split `spec-drift.yml` and
// `scripts/engine-drift.mjs` already use, and for the same reason both of them
// state: a job that goes red for a merge in ANOTHER repository is noise, and
// noise teaches people to skip the tab. That is not a hypothetical here -
// engine-drift.yml shipped a rule no correct manifest could satisfy, failed
// every night, and went unread long enough for the engine to fall 120 commits
// behind (carve-grammars#276/#293/#299).
//
// - LAG IS REPORTED, never gated. A surface advances when its own repository
//   merges something; re-seeding here is a deliberate act that wants reading,
//   because a status moving from GAP to IMPLEMENTED is a claim about a rule.
// - A COMMIT THE CHECKOUT DOES NOT HAVE FAILS. A row citing a revision a fresh
//   clone cannot resolve was read from something nobody else can read - a local
//   branch, or history that has since been rewritten. Three sibling repos have
//   pinned exactly that before (carve#499).
// - A COMMIT THAT IS NOT ON MAIN FAILS, for the same reason: the reading came
//   from an unmerged branch, so the ledger describes a surface no consumer has.
// - A SURFACE WITH NO RECORDED COMMIT FAILS. The seed writes one for every
//   surface it reads; a row without one was hand-edited, and there is nothing
//   to measure from.
// - A LOCAL SURFACE IS REFUSED. Those four are re-probed against the shipped
//   grammar on every pull request, which is strictly stronger than a commit
//   comparison. Accepting one here would report "0 behind" forever and read as
//   coverage.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SURFACES } from './surface-probe.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const [id, checkout, ledgerArg] = process.argv.slice(2)

function fail(message) {
    console.error(`::error::${message}`)
    process.exit(1)
}

if (!id || !checkout) {
    fail('usage: node scripts/surface-drift.mjs <surface-id> <checkout> [construct-ledger.json]')
}

const surface = SURFACES[id]
if (!surface) {
    fail(`${id} is not a surface - scripts/surface-probe.mjs knows ${Object.keys(SURFACES).join(', ')}`)
}
if (surface.local) {
    fail(
        `${id} lives in this repository, so tests/construct-ledger-test.js re-probes its shipped grammar `
        + 'on every pull request - comparing a commit would report 0 behind forever and read as coverage',
    )
}

const ledgerPath = ledgerArg ?? join(root, 'tests', 'lib', 'construct-ledger.json')
let ledger
try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
} catch (error) {
    fail(`the ledger at ${ledgerPath} could not be read: ${error.message}`)
}

const record = ledger.surfaces?.[id]
if (!record) fail(`${ledgerPath} has no ledger for ${id}`)

const pinned = record.commit
if (!pinned) {
    fail(
        `${id} has no "commit" on the ledger, so nothing says which revision its rows were read from - `
        + 're-run: node scripts/seed-construct-ledger.mjs',
    )
}

function git(...args) {
    return spawnSync('git', ['-C', checkout, ...args], { encoding: 'utf8' })
}

if (git('rev-parse', '--verify', `${pinned}^{commit}`).status !== 0) {
    fail(
        `${id} was measured at ${pinned}, which is not a commit in ${surface.repo} - the reading came from `
        + 'a local branch or from history that has since been rewritten, so nobody can reproduce it',
    )
}

if (git('merge-base', '--is-ancestor', pinned, 'origin/main').status !== 0) {
    fail(
        `${id} was measured at ${pinned}, which is not on ${surface.repo} main - the reading came from an `
        + 'unmerged or rewritten branch, so the ledger describes a surface no consumer has',
    )
}

const count = git('rev-list', '--count', `${pinned}..origin/main`)
if (count.status !== 0) {
    fail(`could not count commits from ${pinned} to origin/main in ${checkout}: ${count.stderr.trim()}`)
}

const behind = Number(count.stdout.trim())
const subject = git('log', '-1', '--format=%s', pinned).stdout.trim()
const statuses = Object.values(record.constructs ?? {}).reduce((tally, entry) => {
    tally[entry.status] = (tally[entry.status] ?? 0) + 1

    return tally
}, {})

console.log(`${id}: measured ${record.measured ?? 'on an unrecorded date'} at ${pinned} (${subject})`)
console.log(`  ${Object.entries(statuses).map(([name, n]) => `${n} ${name.toLowerCase()}`).join('  ')}`)
console.log(`${surface.repo} main is ${behind} commit(s) ahead of that reading`)

if (behind > 0) {
    console.log(
        `::warning::${id} was last read ${behind} commit(s) ago; a status on this surface is a record, `
        + 'not a measurement CI can take - re-run: '
        + `CARVE_SURFACE_${id.toUpperCase().replace(/-/g, '_')}=<checkout> `
        + 'node scripts/seed-construct-ledger.mjs',
    )
}
