/**
 * Every construct the spec enumerates is accounted for on every grammar surface.
 *
 * carve-grammars#284. Carve's syntax lives on ten surfaces - tree-sitter, the
 * four here (TextMate, Prism, highlight.js, Tiptap), vscode-carve,
 * intellij-carve, sublime-carve, vim-carve, emacs-carve - and until this file
 * nothing measured them against the same list. `{% ... %}` (carve#1239) landed
 * on five of them and had no rule at all on the other five, and on four of
 * those it was worse than unhighlighted: the payload's markers stayed live, so
 * `{% *not bold* %}` colored a bold run inside a comment.
 *
 * The three things the ruling on that issue asks for, and where each is here:
 *
 *   DERIVED, NOT HAND-WRITTEN. The list comes out of the spec's own normative
 *   `resources/grammar.ebnf` (`scripts/spec-constructs.mjs`). Nothing in this
 *   repo enumerates constructs, so a clause that adds one makes every surface
 *   unclassified until somebody says what it did about it.
 *
 *   THREE COLUMNS, NOT TWO. `tests/lib/construct-ledger.json` gives each
 *   construct on each surface a status, and a construct in NEITHER column
 *   fails. `UNSUPPORTED` needs a reason - an empty reason is a failure, not an
 *   entry - because without the third column every legitimate gap reads as a
 *   defect and the check is muted within a month.
 *
 *   TWO AXES PER CONSTRUCT. Recognized is one question; keeping the payload
 *   inert is another, and a surface can be right about the first and wrong
 *   about the second. For Prism and highlight.js the second axis is MEASURED
 *   here on every run rather than recorded, so it cannot rot.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { specConstructs } from '../scripts/spec-constructs.mjs';
import { SIGNATURES, SURFACES, probe } from '../scripts/surface-probe.mjs';
import { validate } from './lib/construct-ledger.js';
import { VERBATIM, VERBATIM_SAMPLES, measure } from './lib/payload-inertness.js';
import { hljsTokens, prismTokens } from './lib/engines.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const RESEED = 'Re-run: node scripts/seed-construct-ledger.mjs';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const ledger = JSON.parse(readFileSync(resolve(here, 'lib', 'construct-ledger.json'), 'utf8'));
const constructs = specConstructs();
const names = constructs.map((construct) => construct.name);

console.log('the construct list, derived from the spec grammar:');

ok('the derivation reads a construct list out of grammar.ebnf', () => {
    // A FLOOR, not an expected list. The language gains constructs; what must
    // never happen is the derivation quietly returning a handful, because a
    // broken derivation reports an empty checklist as total success.
    assert.ok(
        names.length >= 60,
        `derived only ${names.length} constructs - the derivation broke, and a broken derivation `
            + 'passes every surface',
    );
    assert.strictEqual(new Set(names).size, names.length, 'the derived list has duplicates');
});

ok('it finds both halves of the grammar', () => {
    const kinds = new Set(constructs.map((construct) => construct.kind));
    assert.deepStrictEqual([...kinds].sort(), ['block', 'inline']);
    // Two constructs that are certainly there, one per half, so a derivation
    // that silently reads the wrong production fails instead of passing on an
    // arbitrary 60 names.
    assert.ok(names.includes('blockquote'), 'no blockquote in the derived block list');
    assert.ok(names.includes('braced_comment'), 'no braced_comment in the derived inline list');
});

ok('a family is expanded to its members', () => {
    // `math = math_inline | math_display` is one alternative of `inline_element`
    // and two constructs a surface can carry separately. The expansion rule is
    // mechanical - a pure alternation of bare production names - so it is not a
    // judgement about which families are worth splitting.
    assert.ok(names.includes('math_inline') && names.includes('math_display'), names.join(' '));
    assert.ok(!names.includes('math'), 'the family itself is still in the list beside its members');
});

console.log('\nthe ledger:');

ok('every surface Carve is highlighted on has a ledger', () => {
    assert.deepStrictEqual(Object.keys(ledger.surfaces).sort(), Object.keys(SURFACES).sort());
    assert.strictEqual(Object.keys(SURFACES).length, 10, 'the ten surfaces of carve-grammars#284');
});

ok('the ledger satisfies every rule in tests/lib/construct-ledger.js', () => {
    const findings = validate(names, ledger);
    assert.deepStrictEqual(
        findings, [],
        `the construct ledger is not sound:\n${findings.map((finding) => `    - ${finding}`).join('\n')}\n`
            + `  ${RESEED}, then write the reason or ticket each new row needs.`,
    );
});

ok('the signature table is total over the derived list', () => {
    // The probe is how a row is seeded and re-checked. A construct with no
    // signature can never be found on any surface, so it would seed as a gap
    // everywhere and stay there looking like ten defects.
    const unnamed = names.filter((name) => !(SIGNATURES[name] || []).length);
    assert.deepStrictEqual(
        unnamed, [],
        `constructs with no entry in SIGNATURES (scripts/surface-probe.mjs): ${unnamed.join(', ')}. `
            + 'Add the names a surface would plausibly give each one.',
    );
});

ok('the verbatim list and the samples that measure it are the same list', () => {
    assert.deepStrictEqual(ledger.verbatimPayload, VERBATIM);
});

console.log('\nthe four surfaces in this repository, re-probed:');

for (const [id, surface] of Object.entries(SURFACES)) {
    if (!surface.local) continue;
    const found = probe(id, repoRoot);
    const entries = ledger.surfaces[id].constructs;

    ok(`${id}: every IMPLEMENTED row cites a name the shipped grammar really carries`, () => {
        const sources = surface.files.map((file) => readFileSync(resolve(repoRoot, file), 'utf8')).join('\n');
        for (const [name, entry] of Object.entries(entries)) {
            if (entry.status !== 'IMPLEMENTED') continue;
            assert.ok(
                sources.includes(entry.evidence),
                `${id}/${name}: the ledger cites ${JSON.stringify(entry.evidence)} as the rule for this `
                    + 'construct and no such name is in the grammar any more - the rule was renamed or '
                    + 'removed, so the row is a claim about something that is not there',
            );
        }
    });

    ok(`${id}: a rule the grammar has is not recorded as missing`, () => {
        // One direction only, deliberately. A probe HIT means the surface names
        // the construct, so calling it a gap is stale. A probe MISS is not
        // evidence of absence: a surface may fold a family under one name, and
        // the ledger records that name as the evidence.
        const stale = [...found.keys()].filter((name) => entries[name].status !== 'IMPLEMENTED');
        assert.deepStrictEqual(
            stale, [],
            `${id}: the grammar names these constructs but the ledger does not call them implemented - `
                + `${stale.join(', ')}. ${RESEED}`,
        );
    });
}

console.log('\nthe second axis, measured:');

for (const [id, tokenize] of [['prism', prismTokens], ['highlightjs', hljsTokens]]) {
    ok(`${id}: the recorded payload behavior is what the engine actually does`, () => {
        for (const [name, sample] of Object.entries(VERBATIM_SAMPLES)) {
            const entry = ledger.surfaces[id].constructs[name];
            if (entry.status !== 'IMPLEMENTED') continue;
            assert.strictEqual(
                measure(tokenize, sample),
                entry.payload,
                `${id}/${name}: the ledger says "${entry.payload}" and tokenizing `
                    + `${JSON.stringify(sample)} says otherwise. A construct whose payload is not Carve `
                    + 'must keep the markers inside it inert; when it stops doing so, this is where it '
                    + 'shows.',
            );
        }
    });
}

/*
 * THE CHECK HAS TO BE SEEN REJECTING SOMETHING.
 *
 * Everything above asserts that the committed ledger is clean, which is exactly
 * as true of a validator that finds nothing wrong with anything. This repo has
 * shipped three checks that could not fail what they existed to catch
 * (carve-grammars#295, #298, #300), so each rule below is driven over a ledger
 * built to break it and must be reported by name.
 */
console.log('\noracle fixtures - the validator rejecting a broken ledger:');

/** A minimal sound ledger over `list`, to mutate one rule at a time. */
const soundLedger = (list) => ({
    verbatimPayload: ['code_span'],
    surfaces: {
        example: {
            constructs: Object.fromEntries(list.map((name) => [
                name,
                { status: 'IMPLEMENTED', evidence: 'x', payload: name === 'code_span' ? 'inert' : 'parsed' },
            ])),
        },
    },
});

const BROKEN = [
    ['a construct in neither column', (list) => {
        const doc = soundLedger(list);
        delete doc.surfaces.example.constructs[list[0]];

        return [doc, 'in neither column'];
    }],
    ['an UNSUPPORTED entry with an empty reason', (list) => {
        const doc = soundLedger(list);
        doc.surfaces.example.constructs[list[0]] = { status: 'UNSUPPORTED', reason: '   ', payload: 'none' };

        return [doc, 'empty reason'];
    }],
    ['an UNSUPPORTED entry with no reason at all', (list) => {
        const doc = soundLedger(list);
        doc.surfaces.example.constructs[list[0]] = { status: 'UNSUPPORTED', payload: 'none' };

        return [doc, 'empty reason'];
    }],
    ['a GAP with no ticket', (list) => {
        const doc = soundLedger(list);
        doc.surfaces.example.constructs[list[0]] = { status: 'GAP', ticket: '', payload: 'none' };

        return [doc, 'needs a ticket'];
    }],
    ['a leak with no note saying what leaks', (list) => {
        const doc = soundLedger(list);
        doc.surfaces.example.constructs.code_span = { status: 'IMPLEMENTED', evidence: 'x', payload: 'leaks' };

        return [doc, 'needs a note'];
    }],
    ['a verbatim payload called "parsed"', (list) => {
        const doc = soundLedger(list);
        doc.surfaces.example.constructs.code_span = { status: 'IMPLEMENTED', evidence: 'x', payload: 'parsed' };

        return [doc, 'is not an answer'];
    }],
    ['an entry for a construct the grammar dropped', (list) => {
        const doc = soundLedger(list);
        doc.surfaces.example.constructs.blink_tag = { status: 'IMPLEMENTED', evidence: 'x', payload: 'parsed' };

        return [doc, 'no longer has'];
    }],
];

ok('a sound ledger is reported clean, so the fixtures below mean something', () => {
    assert.deepStrictEqual(validate(names, soundLedger(names)), []);
});

for (const [what, build] of BROKEN) {
    ok(`reports ${what}`, () => {
        const [doc, expected] = build(names);
        const findings = validate(names, doc);
        assert.ok(
            findings.some((finding) => finding.includes(expected)),
            `the validator did not report ${what} - it said ${JSON.stringify(findings)}`,
        );
    });
}

ok('the measurement reports a payload that really does leak', () => {
    // The measured half needs its own demonstration: "every engine is inert"
    // would also be true of a measurement that never looks inside the payload.
    // A tokenizer that scopes everything as bold is what a leak looks like.
    const allBold = (source) => [{ scope: 'strong', text: source }];
    assert.strictEqual(measure(allBold, VERBATIM_SAMPLES.braced_comment), 'leaks');
    // ... and not of one that scopes it as the construct it is.
    const allComment = (source) => [{ scope: 'comment', text: source }];
    assert.strictEqual(measure(allComment, VERBATIM_SAMPLES.braced_comment), 'inert');
});

/*
 * A NEW TEST FILE IN THIS REPO IS DEAD UNTIL `npm test` NAMES IT.
 *
 * The `test` script is an explicit list of `node tests/*.js` invocations rather
 * than a glob, so a file added here runs when someone runs it by hand and never
 * again. A checklist nobody runs is the exact failure carve-grammars#284 is
 * about, one level up.
 */
ok('this file is in the npm test chain', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    const self = 'tests/construct-ledger-test.js';
    assert.ok(
        pkg.scripts.test.includes(`node ${self}`),
        `package.json "test" does not run ${self}, so this file proves nothing in CI - `
            + 'the script is an explicit list, not a glob',
    );
});

console.log(`\n${passed} passed`);
