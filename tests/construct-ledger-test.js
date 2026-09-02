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

import { mkdtempSync, writeFileSync as write } from 'node:fs';
import { tmpdir } from 'node:os';

import { specConstructs } from '../scripts/spec-constructs.mjs';
import { INDISTINGUISHABLE, SIGNATURES, SURFACES, probe, rootVariable, vocabulary } from '../scripts/surface-probe.mjs';
import { UNSUPPORTED_ON } from '../scripts/unsupported-on.mjs';
import { validate } from './lib/construct-ledger.js';
import { VERBATIM, VERBATIM_SAMPLES, measure } from './lib/payload-inertness.js';
import { MIN_ATTRIBUTED, SCOPE_SAMPLES, attribute, refusal, scopeReader } from './lib/rule-scopes.js';
import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { unfaithful } from './lib/textmate-engine.js';
import { measureModel } from './lib/tiptap-payload.js';

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

ok('every construct the probe cannot decide names a real sibling', () => {
    // carve-grammars#314. `UNMEASURED` is only honest while both halves are
    // constructs the grammar still has; a stale entry would mute a row.
    for (const [construct, sibling] of Object.entries(INDISTINGUISHABLE)) {
        assert.ok(names.includes(construct), `INDISTINGUISHABLE names ${construct}, not a construct`);
        assert.ok(names.includes(sibling), `${construct}'s sibling ${sibling} is not a construct`);
    }
});

ok('every UNSUPPORTED row is one the re-measurement would write again', () => {
    /*
     * THE LEDGER AND THE SEED'S PERMISSION TABLE ARE TWO RECORDS OF ONE RULE.
     *
     * `UNSUPPORTED` is the only status written by hand, so
     * `scripts/unsupported-on.mjs` keeps a list of which surface may claim it
     * for which construct, and the seeder reads that list rather than owning
     * it - a table a test has to read cannot live inside a script that
     * rewrites the ledger when imported. A row the ledger records and that table
     * does not permit is not a harmless disagreement: the next re-measurement
     * of that surface rewrites the row to GAP and DELETES the stated reason,
     * which is precisely what the seed's own docblock promises never happens.
     *
     * It happened. carve-grammars#330 recorded emacs-carve/smart_quote
     * UNSUPPORTED from the ruling in markup-carve/emacs-carve#23, and the
     * permission table still said only the Tiptap bridge could claim any
     * smart-typography construct. Re-seeding that surface in carve-grammars#332
     * reverted the ruling silently, inside a commit whose whole purpose was to
     * re-measure it - and nothing here could see it, because the ledger it
     * produced was perfectly sound on its own terms.
     *
     * Written as "the table permits every committed row" rather than as an
     * equality: a surface listed in the table with no such row yet is a
     * decision waiting to be measured, not a defect.
     */
    const unwritable = [];
    for (const [id, record] of Object.entries(ledger.surfaces)) {
        for (const [name, entry] of Object.entries(record.constructs || {})) {
            if (entry.status !== 'UNSUPPORTED') continue;
            if ((UNSUPPORTED_ON[name] || []).includes(id)) continue;
            unwritable.push(`${id}/${name}`);
        }
    }
    assert.deepStrictEqual(
        unwritable, [],
        `these rows are UNSUPPORTED on the ledger and UNSUPPORTED_ON in scripts/unsupported-on.mjs `
            + `does not permit them: ${unwritable.join(', ')}. Re-seeding that surface would rewrite each `
            + 'one to GAP and drop its stated reason. Add the surface to that table, with the reason the '
            + 'ruling gives, rather than leaving the two records disagreeing.',
    );
});

ok('an UNMEASURED row is a blind spot, not a gap wearing a hat', () => {
    /*
     * The state means "the surface names this construct's sibling and a name
     * cannot separate the two". If the sibling is NOT implemented there, no
     * name was folded and the row is an ordinary gap - which is the way the
     * state would get used to quiet one.
     */
    for (const [id, record] of Object.entries(ledger.surfaces)) {
        for (const [name, entry] of Object.entries(record.constructs || {})) {
            if (entry.status !== 'UNMEASURED') continue;
            const sibling = INDISTINGUISHABLE[name];
            assert.ok(sibling, `${id}/${name}: UNMEASURED, but the probe has no blind spot for it`);
            assert.strictEqual(
                record.constructs[sibling].status, 'IMPLEMENTED',
                `${id}/${name}: UNMEASURED says the sibling rule ${sibling} could be carrying this `
                    + 'construct too, and that surface has no rule for the sibling either - so it is a GAP',
            );
        }
    }
});

console.log('\nthe probe reads a surface\'s vocabulary and not its prose:');

ok('the tree-sitter read is the union of rules, externals and node types', () => {
    /*
     * carve-grammars#314: reading `rules` alone under-read that grammar by 150
     * names, and five constructs with a rule read as gaps. Driven over a
     * synthetic checkout rather than the real one so it fails on the
     * EXTRACTOR - the real grammar is in another repository and is not always
     * there to read.
     */
    const root = mkdtempSync(resolve(tmpdir(), 'carve-probe-'));
    write(resolve(root, 'grammar.json'), JSON.stringify({
        rules: { heading: {} },
        externals: [{ type: 'EXTERNAL', name: 'hard_line_break' }, { type: 'STRING', value: '#' }],
    }));
    write(resolve(root, 'node-types.json'), JSON.stringify([
        { type: 'paragraph', named: true },
        { type: 'TODO', named: false },
        { type: 'table', named: true, children: { types: [{ type: 'table_cell', named: true }] } },
    ]));

    const surface = SURFACES['tree-sitter-carve'];
    const saved = surface.files;
    surface.files = ['grammar.json', 'node-types.json'];
    try {
        const found = vocabulary('tree-sitter-carve', root).map((entry) => entry.raw);
        for (const name of ['heading', 'hard_line_break', 'paragraph', 'table_cell']) {
            assert.ok(found.includes(name), `the tree-sitter read lost ${name}: ${found.join(', ')}`);
        }
        // ... and an ANONYMOUS node type is a literal, not a name for anything.
        assert.ok(!found.includes('TODO'), `an unnamed node type reached the vocabulary: ${found.join(', ')}`);
    } finally {
        surface.files = saved;
    }
});

ok('the Tiptap read skips the section that says what is NOT modeled', () => {
    /*
     * carve-grammars#311 stopped this extractor reading the map's prose
     * VALUES; the same sentences were still arriving as KEYS, and `unmapped`
     * is a whole section of them. Nine constructs - the eight smart-typography
     * ones and soft_break - were IMPLEMENTED on the strength of an entry
     * saying they are not modeled (carve-grammars#314).
     */
    const map = JSON.parse(readFileSync(resolve(repoRoot, 'tiptap', 'schema-map.json'), 'utf8'));
    const unmapped = Object.keys(map.unmapped);
    assert.ok(unmapped.includes('smart_punctuation'), 'the fixture this test is about moved');

    // The map only. `carve-to-pm.js` has a `case` for three of these, because
    // a converter still has to DO something when it meets a node it cannot
    // model, and that case really is a name the surface gives the construct.
    const surface = SURFACES.tiptap;
    const saved = surface.files;
    surface.files = ['tiptap/schema-map.json'];
    let found;
    try {
        found = new Set(vocabulary('tiptap', repoRoot).map((entry) => entry.raw));
    } finally {
        surface.files = saved;
    }
    const leaked = unmapped.filter((name) => found.has(name));
    assert.deepStrictEqual(
        leaked, [],
        `schema-map.json's "unmapped" section says these are NOT modeled and they are in the `
            + `vocabulary anyway: ${leaked.join(', ')}`,
    );
    // The section the map DOES declare types in is still read.
    assert.ok(found.has('code_block'), 'the Tiptap read lost the types section');
});

/*
 * THE TOKENIZERS AND THE RULE-SCOPE READERS, BUILT BEFORE THE FIRST CHECK THAT
 * NEEDS THEM.
 *
 * The re-probe below asks whether a NAME the grammar carries is recorded as
 * missing, and the answer depends on whether that name actually scopes the
 * construct - carve-grammars#376. So the readers cannot be built after it.
 */
const tokenizers = [['prism', prismTokens], ['highlightjs', hljsTokens], ...await textmateEngines()];

/** `id -> (construct, rule) => the grammar refuses that claim`, where it can be read. */
const refuses = new Map();
for (const [id, tokenize] of tokenizers) {
    const root = SURFACES[id].local ? repoRoot : process.env[rootVariable(id)];
    const reader = root ? scopeReader(id, root) : null;
    if (reader) refuses.set(id, { reader, tokenize, refused: refusal(reader, tokenize) });
}

console.log('\nthe four surfaces in this repository, re-probed:');

for (const [id, surface] of Object.entries(SURFACES)) {
    if (!surface.local) continue;
    const found = probe(id, repoRoot);
    const entries = ledger.surfaces[id].constructs;

    ok(`${id}: every IMPLEMENTED row cites a name the shipped grammar really carries`, () => {
        /*
         * THE VOCABULARY, NOT THE FILE'S TEXT.
         *
         * This read the sources as one string and asked whether the evidence
         * was a SUBSTRING of them, which is the trap the probe's own docblock
         * describes - a file's prose names the constructs it does NOT have.
         * `prism/carve.js` carries the comment "Prism has no cross-reference
         * token at all" beside the lookbehind that worked around the absence,
         * so `cross-ref` was a substring of that file for as long as the rule
         * was missing, and a row citing it would have re-checked green
         * (carve-grammars#307). Deleting a rule and leaving the comment that
         * explains it is the ordinary way a grammar changes, so this was not a
         * remote failure mode.
         *
         * `vocabulary()` is the same extractor the seed uses, so the re-check
         * and the seed now agree on what counts as a name.
         */
        const declared = new Set(vocabulary(id, repoRoot).map((item) => item.raw));
        for (const [name, entry] of Object.entries(entries)) {
            if (entry.status !== 'IMPLEMENTED') continue;
            assert.ok(
                declared.has(entry.evidence),
                `${id}/${name}: the ledger cites ${JSON.stringify(entry.evidence)} as the rule for this `
                    + 'construct and the grammar declares no such name any more - the rule was renamed or '
                    + 'removed, so the row is a claim about something that is not there',
            );
        }
    });

    ok(`${id}: a rule the grammar has is not recorded as missing`, () => {
        /*
         * One direction only, deliberately. A probe HIT means the surface names
         * the construct, so calling it a gap is stale. A probe MISS is not
         * evidence of absence: a surface may fold a family under one name, and
         * the ledger records that name as the evidence.
         *
         * UNLESS THE GRAMMAR REFUSES THE HIT. The probe reads names, and one
         * name covers a family: `smart_typography` is attributed to all eight
         * smart-typography constructs on all three grammars here and matches
         * five of them. A hit the construct's own sample refutes is not a
         * recognition, so recording it as a gap is the accurate row rather than
         * a stale one (carve-grammars#376).
         */
        const refused = refuses.get(id)?.refused;
        const stale = [...found.keys()].filter((name) => entries[name].status !== 'IMPLEMENTED'
            && !refused?.(name, found.get(name)));
        assert.deepStrictEqual(
            stale, [],
            `${id}: the grammar names these constructs but the ledger does not call them implemented - `
                + `${stale.join(', ')}. ${RESEED}`,
        );
    });

    ok(`${id}: every IMPLEMENTED row cites the name the probe attributes to that construct`, () => {
        /*
         * THE OTHER DIRECTION, AND WHY THE TWO CHECKS ABOVE DO NOT COVER IT.
         *
         * The evidence check asks whether the cited name is DECLARED anywhere
         * in the vocabulary. The gap check asks whether a probe hit is recorded
         * as missing. Neither asks whether the cited name is the one the probe
         * attributes to THIS construct - so an IMPLEMENTED row seeded off a
         * SIGNATURE_OVERRIDES entry survives that entry being deleted: the
         * fold disappears, the probe stops finding the construct, and the row
         * stays green because DIV_BLOCK is still a declared name.
         *
         * Measured on carve-grammars#317, both ways: reverting
         * `highlightjs/carve.js` and keeping the ledger fails loudly on the
         * first renamed mode, and reverting the six highlight.js overrides in
         * `scripts/surface-probe.mjs` and keeping the ledger passed all 35
         * assertions. Half of that fix was unguarded.
         *
         * This closes it by RE-DERIVING the IMPLEMENTED half rather than
         * re-reading it: the row must say what the instrument says today. The
         * cost is that a fold has to be written down in the override table
         * instead of typed into the ledger by hand, which is where a reviewer
         * can see it and where the reason for it lives.
         */
        const wrong = Object.entries(entries)
            .filter(([name, entry]) => entry.status === 'IMPLEMENTED' && found.get(name) !== entry.evidence)
            .map(([name, entry]) => `${name} cites ${JSON.stringify(entry.evidence)}, probe says `
                + `${JSON.stringify(found.get(name) ?? null)}`);
        assert.deepStrictEqual(
            wrong, [],
            `${id}: these rows cite a name the probe does not attribute to the construct - `
                + `${wrong.join('; ')}. Either the fold belongs in SIGNATURE_OVERRIDES, or the row is `
                + `a hand-written claim the instrument cannot reach. ${RESEED}`,
        );
    });
}

console.log('\nthe first axis, measured - does the cited rule actually colour the construct?');

/*
 * `IMPLEMENTED` USED TO BE A SPELLING (carve-grammars#376).
 *
 * The three checks in the loop above all ask about NAMES: that the cited name
 * is declared, that the probe attributes it to this construct, that a name the
 * grammar has is not recorded as missing. None of them asks the grammar to
 * colour anything, and `evidence` is satisfied by any non-empty string, so a
 * rule whose name plausibly covers a family recorded every member of that
 * family as implemented. `smart_typography` names eight constructs on all three
 * grammars here and matches five.
 *
 * So the row is now measured against the construct's own sample, and the
 * question is not "is the payload scoped" but "is it scoped by the rule this
 * row cites". The weaker question passes `braced_en_dash` on every surface: the
 * run IS coloured, by the CriticMarkup deletion rule reading `{--}` as an empty
 * `{-...-}`, which is a colour that says the wrong thing
 * (carve-grammars#378).
 */

ok('every derived construct has a sample, or a written reason it cannot be scoped', () => {
    // TOTAL over the derived list, the way SIGNATURES is: a spec clause that
    // adds a construct then forces the decision here too, instead of arriving
    // as a row nothing can measure.
    const unsampled = names.filter((name) => !SCOPE_SAMPLES[name]);
    assert.deepStrictEqual(
        unsampled, [],
        `constructs with no entry in SCOPE_SAMPLES (tests/lib/rule-scopes.js): ${unsampled.join(', ')}. `
            + 'Give each a sample and the run whose scope answers the question, or say why it carries no '
            + 'marker of its own.',
    );
    const dead = Object.keys(SCOPE_SAMPLES).filter((name) => !names.includes(name));
    assert.deepStrictEqual(dead, [], `SCOPE_SAMPLES names constructs the grammar no longer has: ${dead.join(', ')}`);
});

ok('a construct with no marker of its own is not IMPLEMENTED on a grammar that scopes markers', () => {
    /*
     * The `unscopable` spelling is the alternative to a sample, and this is
     * what stops it being an exemption. A row skipped for want of a sample
     * would be exactly the hole this file is closing, one level down.
     */
    const claimed = [];
    for (const [id] of tokenizers) {
        for (const [name, sample] of Object.entries(SCOPE_SAMPLES)) {
            if (!sample.unscopable) continue;
            if (ledger.surfaces[id].constructs[name].status === 'IMPLEMENTED') claimed.push(`${id}/${name}`);
        }
    }
    assert.deepStrictEqual(
        claimed, [],
        `these rows are IMPLEMENTED for a construct SCOPE_SAMPLES says carries no marker of its own: `
            + `${claimed.join(', ')}. Either the construct is scopable after all - give it a sample - or `
            + 'the row is a claim nothing can support.',
    );
});

for (const [id, tokenize] of tokenizers) {
    if (!refuses.has(id)) continue;
    const { reader } = refuses.get(id);

    ok(`${id}: every IMPLEMENTED row's evidence really scopes the construct`, () => {
        const problems = [];
        let attributed = 0;
        for (const [name, entry] of Object.entries(ledger.surfaces[id].constructs)) {
            if (entry.status !== 'IMPLEMENTED') continue;
            const sample = SCOPE_SAMPLES[name];
            if (!sample || sample.unscopable) continue;
            const { verdict, got, allowed } = attribute(reader, tokenize, sample, entry.evidence);
            if (verdict === 'attributed') {
                attributed++;
                continue;
            }
            const saw = got.length ? got.join(', ') : 'nothing at all';
            problems.push(
                `${name} [${verdict}]: cites ${JSON.stringify(entry.evidence)}, which can scope `
                    + `${allowed.join(', ') || '(no scope this reader can find)'}; `
                    + `${JSON.stringify(sample.payload)} in ${JSON.stringify(sample.sample)} carries ${saw}`,
            );
        }
        assert.deepStrictEqual(
            problems, [],
            `${id}: these rows cite a rule that does not colour the construct:\n`
                + `${problems.map((problem) => `    - ${problem}`).join('\n')}\n`
                + '  An `unresolved` verdict is the READER failing, not the grammar - the cited name is '
                + 'not one it can resolve to a rule, so nothing was measured. Anything else is the row: '
                + 'record UNSUPPORTED with a reason, or GAP with a ticket, rather than IMPLEMENTED with '
                + `prose. ${RESEED}`,
        );

        /*
         * AND A FLOOR, for the reason `MIN_ASSERTABLE` exists one file over:
         * this check runs over the IMPLEMENTED rows, so a ledger that stopped
         * calling anything implemented would leave it asserting nothing and
         * printing a tick.
         */
        const floor = MIN_ATTRIBUTED[id];
        if (SURFACES[id].local) {
            assert.ok(
                floor !== undefined,
                `no MIN_ATTRIBUTED entry for "${id}", so how much this check measures is unchecked`,
            );
        }
        assert.ok(
            floor === undefined || attributed >= floor,
            `${id}: only ${attributed} row(s) were measured against the grammar, expected at least `
                + `${floor} - the rest are UNSUPPORTED, GAP, or carry no sample`,
        );
    });
}

console.log('\nthe second axis, measured:');

ok('each tokenizer reproduces its input, so a measurement is about the payload', () => {
    /*
     * `measure` locates the payload by COUNTING CHARACTERS into the source, so
     * a tokenizer that drops one reports about the wrong region and passes.
     * Shiki tokenizes line by line and returns no line endings; the TextMate
     * adapter puts them back, and this is what says it still does.
     */
    for (const [id, tokenize] of tokenizers) {
        for (const sample of Object.values(VERBATIM_SAMPLES)) {
            const problem = unfaithful(tokenize, sample);
            assert.strictEqual(problem, null, `${id}: ${problem}`);
        }
    }
});

/**
 * What is wrong with a recorded payload cell, given what the SAMPLE measures.
 *
 * THE SAMPLE IS A FLOOR, NOT THE MEASUREMENT, so this compares in one direction
 * and names which. `VERBATIM_SAMPLES` is ONE document per construct;
 * `tests/opaque-payload-test.js` generates hundreds and finds leaks the sample
 * cannot - on every surface measured for the first time since
 * carve-grammars#320 (tree-sitter, emacs-carve, and now intellij-carve,
 * carve-grammars#329) the sample called every row inert and the generated sweep
 * disagreed on several. A cell recording `leaks` where the sample is inert is
 * therefore the two instruments AGREEING, and an equality check here would have
 * left the ledger unable to record a leak only the sweep can see.
 *
 * The direction that keeps its teeth is the other one: a sample that LEAKS
 * against a cell that does not is a regression, and this is where it shows.
 *
 * NOTHING GOES UNGUARDED BY THE WEAKENING. A `leaks` cell is not free - the
 * sweep refuses one with no `KNOWN_LEAKS` row asserting it, and that row
 * asserts the leak is STILL there, so a fix fails the sweep, the row comes out,
 * and the cell has to be corrected with it.
 *
 * @param {'inert'|'leaks'} measured - what the construct's own sample does.
 * @param {string} recorded - what the ledger cell says.
 * @returns {string|null} the complaint, or null when the cell is allowed.
 */
function payloadCellProblem(measured, recorded) {
    if (measured === recorded) return null;
    if (measured === 'inert' && recorded === 'leaks') return null;

    return `the ledger says "${recorded}" and the sample says "${measured}"`;
}

for (const [id, tokenize] of tokenizers) {
    ok(`${id}: the recorded payload behavior is what the engine actually does`, () => {
        for (const [name, sample] of Object.entries(VERBATIM_SAMPLES)) {
            const entry = ledger.surfaces[id].constructs[name];
            if (entry.status !== 'IMPLEMENTED') continue;
            const problem = payloadCellProblem(measure(tokenize, sample), entry.payload);
            assert.strictEqual(
                problem,
                null,
                `${id}/${name}: ${problem} for ${JSON.stringify(sample)}. A construct whose payload is `
                    + 'not Carve must keep the markers inside it inert; when it stops doing so, this is '
                    + 'where it shows. (A cell recording "leaks" against an inert SAMPLE is allowed - '
                    + 'the generated sweep sees more documents than one - but nothing else is.)',
            );
        }
    });
}

/*
 * AND THE ALLOWANCE ABOVE HAS TO BE SEEN NOT SWALLOWING THE OTHER DIRECTION.
 *
 * A one-directional check is one edit away from no check at all, so the rule is
 * a function and the four combinations are put through it here. Without this,
 * a `return null` at the top would pass every row above.
 */
ok('a payload cell is refused in every direction but the one the sweep needs', () => {
    assert.strictEqual(payloadCellProblem('inert', 'inert'), null);
    assert.strictEqual(payloadCellProblem('leaks', 'leaks'), null);
    // The allowance: the sweep found what the sample could not.
    assert.strictEqual(payloadCellProblem('inert', 'leaks'), null);
    // The regression this row exists to keep catchable.
    assert.match(payloadCellProblem('leaks', 'inert') ?? '', /says "inert" and the sample says "leaks"/);
    // And a cell that never got measured is not quietly accepted either.
    assert.match(payloadCellProblem('inert', 'unmeasured') ?? '', /says "unmeasured"/);
});

ok('tiptap: the recorded payload behavior is what the bridge actually does', () => {
    /*
     * The same axis on the one surface that is not a tokenizer. A schema bridge
     * has no scopes, so the question is whether the payload reaches the editor
     * model as one uninterrupted run under no markup mark
     * (tests/lib/tiptap-payload.js).
     */
    for (const [name, sample] of Object.entries(VERBATIM_SAMPLES)) {
        const entry = ledger.surfaces.tiptap.constructs[name];
        if (entry.status !== 'IMPLEMENTED') continue;
        assert.strictEqual(
            measureModel(sample),
            entry.payload,
            `tiptap/${name}: the ledger says "${entry.payload}" and converting `
                + `${JSON.stringify(sample)} says otherwise.`,
        );
    }
});

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
    ['an UNMEASURED entry with no ticket', (list) => {
        const doc = soundLedger(list);
        doc.surfaces.example.constructs[list[0]] = { status: 'UNMEASURED', ticket: '', payload: 'none' };

        return [doc, 'UNMEASURED needs a ticket'];
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

/*
 * THE EVIDENCE CHECK, SEEN REFUSING - THE SAME DISCIPLINE, ONE AXIS OVER.
 *
 * `attribute` returns a verdict rather than throwing so the four answers can be
 * driven over synthetic tokenizers here. Without this, a version that returned
 * `attributed` unconditionally would pass every row above and read as a clean
 * sweep of 200 measurements.
 */
const FAKE_READER = {
    separator: ' ',
    scopesOf: (rule) => ({ known: new Set(['scope.known']), other: new Set(['scope.other']) })[rule] ?? null,
};
const wholeAs = (scope) => (source) => [{ scope, text: source }];
const FAKE_SAMPLE = { sample: 'a X b', payload: 'X' };
const verdictOf = (scope, rule = 'known') => attribute(FAKE_READER, wholeAs(scope), FAKE_SAMPLE, rule).verdict;

ok('accepts a payload the cited rule really scopes', () => {
    assert.strictEqual(verdictOf('scope.known'), 'attributed');
});

ok('refuses a payload nothing scopes', () => {
    assert.strictEqual(verdictOf(null), 'unscoped');
});

ok('refuses a payload scoped by a DIFFERENT rule', () => {
    // The braced-en-dash shape: coloured, and by the wrong rule. "Carries a
    // scope" cannot see this, which is why the check asks the sharper question.
    assert.strictEqual(verdictOf('scope.other'), 'other-rule');
});

ok('the TextMate root scope is not a rule any grammar earns', () => {
    // Every TextMate token carries `source.carve`, so counting it would make
    // the check pass for every construct on all three TextMate surfaces.
    assert.strictEqual(verdictOf('source.carve'), 'unscoped');
});

ok('a cited name the reader cannot resolve is reported, never passed', () => {
    assert.strictEqual(verdictOf('scope.known', 'no-such-rule'), 'unresolved');
});

ok('the refusal predicate refuses the two verdicts that are measurements, and no others', () => {
    // A refusal demotes a row in the seeder, so which verdicts refuse is worth
    // pinning: an `unresolved` reader must not rewrite the ledger into gaps.
    const refused = refusal(FAKE_READER, wholeAs('scope.other'));
    assert.strictEqual(refused('em_dash', 'known'), true, 'a rule that does not match must refuse');
    assert.strictEqual(refused('em_dash', 'other'), false, 'the rule that matches must not refuse');
    assert.strictEqual(refused('em_dash', 'no-such-rule'), false, 'an unresolvable name measures nothing');
    assert.strictEqual(refusal(FAKE_READER, wholeAs(null))('paragraph', 'known'), false,
        'a construct with no marker of its own is never refused');
});

ok('the real grammars refuse a row that cites a real but wrong rule', () => {
    /*
     * The fixtures above drive a tokenizer written to answer them. This drives
     * the SHIPPED grammars: every surface scopes `em_dash` and `code_span`, and
     * neither rule is the other, so citing the code-span rule for the dash has
     * to be refused on all three. A reader that resolved every name to every
     * scope would pass the committed ledger and fail here.
     */
    for (const [id, tokenize] of tokenizers) {
        if (!refuses.has(id)) continue;
        const { reader } = refuses.get(id);
        const wrong = ledger.surfaces[id].constructs.code_span.evidence;
        const { verdict } = attribute(reader, tokenize, SCOPE_SAMPLES.em_dash, wrong);
        assert.strictEqual(
            verdict, 'other-rule',
            `${id}: citing ${JSON.stringify(wrong)} for em_dash was not refused - the reader is not `
                + 'separating one rule from another',
        );
    }
});

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
