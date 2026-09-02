/**
 * (Re)measure `tests/lib/construct-ledger.json`.
 *
 * The ledger is DATA, and this is how it is produced so that nobody has to type
 * 720 rows: the construct list comes from the spec (`spec-constructs.mjs`), the
 * status comes from what each surface's own vocabulary names (`surface-probe.mjs`),
 * and the payload axis for Prism and highlight.js comes from tokenizing a sample
 * whose payload holds a live emphasis marker.
 *
 * Everything a human wrote - an `UNSUPPORTED` reason, a `payloadNote`, a ticket -
 * is carried over from the existing file. A re-measurement never silently drops a
 * stated reason; it only moves statuses.
 *
 *   node scripts/seed-construct-ledger.mjs
 *
 * The six surfaces that live in other repositories are read from checkouts named
 * by environment variables (`CARVE_SURFACE_VIM_CARVE=/path/to/vim-carve`); any
 * that is not given keeps whatever the committed ledger already records for it,
 * and the file says which commit that reading was taken at.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { specConstructs } from './spec-constructs.mjs';
import { INDISTINGUISHABLE, SURFACES, probe, rootVariable } from './surface-probe.mjs';
import { UNSUPPORTED_ON, reasonFor } from './unsupported-on.mjs';
import { VERBATIM, VERBATIM_SAMPLES, measure } from '../tests/lib/payload-inertness.js';
import { refusal, scopeReader } from '../tests/lib/rule-scopes.js';

const here = dirname(fileURLToPath(import.meta.url));
const LEDGER = resolve(here, '..', 'tests', 'lib', 'construct-ledger.json');

/** The head of the surface's checkout, so a recorded row says what it was read from. */
function commitOf(root) {
    try {
        return execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

const previous = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { surfaces: {} };
const constructs = specConstructs();

/*
 * Measured payload behavior for every surface this process can drive.
 *
 * Prism and highlight.js tokenize in process; the TextMate family does too,
 * through Shiki, and Tiptap answers a model-shaped version of the same
 * question (carve-grammars#320). Before this, `textmate`, `tiptap`,
 * `vscode-carve` and `intellij-carve` carried 11 to 13 `unmeasured` rows each
 * and the second axis was recorded rather than re-measured on seven of the ten
 * surfaces.
 *
 * A surface absent from this map keeps whatever the committed ledger records,
 * which is what the `unmeasured` state is for.
 */
const measured = {};

/*
 * AND THE FIRST AXIS, MEASURED TOO, WHEREVER A GRAMMAR CAN BE TOKENIZED HERE.
 *
 * A probe HIT is a name, and a name is not a colour: `smart_typography` names
 * eight constructs on all three local grammars and covers five of them, so five
 * rows seeded IMPLEMENTED off a rule that never matches them
 * (carve-grammars#376). Where the construct's own sample says the cited rule
 * does not scope it, the hit is refused here and the row falls through to the
 * same UNSUPPORTED / GAP branches an absent name reaches.
 *
 * `unresolved` - a cited name this reader cannot resolve to a rule - is NOT a
 * refusal. That is the instrument failing, not the grammar, and demoting a row
 * on it would turn a broken reader into a page of fresh gaps;
 * `tests/construct-ledger-test.js` fails loudly on it instead.
 */
const refuses = {};
{
    const { prismTokens, hljsTokens } = await import('../tests/lib/engines.js');
    const { textmateEngines } = await import('../tests/lib/surface-engines.js');
    const tokenizers = [['prism', prismTokens], ['highlightjs', hljsTokens], ...await textmateEngines()];
    for (const [id, tokenize] of tokenizers) {
        measured[id] = Object.fromEntries(
            Object.entries(VERBATIM_SAMPLES).map(([name, sample]) => [name, measure(tokenize, sample)]),
        );

        const root = SURFACES[id].local ? resolve(here, '..') : process.env[rootVariable(id)];
        const reader = scopeReader(id, root);
        if (!reader) continue;
        refuses[id] = refusal(reader, tokenize);
    }

    const { measureModel } = await import('../tests/lib/tiptap-payload.js');
    measured.tiptap = Object.fromEntries(Object.entries(VERBATIM_SAMPLES).map(([name, sample]) => {
        const verdict = measureModel(sample);
        if (verdict === 'lost') {
            /*
             * The bridge dropped a payload the engine holds verbatim, which is
             * neither `inert` nor `leaks` and must not be rounded into either -
             * the ledger would then record a loss as a pass. Stop, so whoever
             * runs the seeder reads it.
             */
            throw new Error(
                `tiptap/${name}: the payload of ${JSON.stringify(sample)} is not in the editor model at `
                    + 'all. That is a third answer the ledger has no column for; fix the bridge or give '
                    + 'the ledger the column, but do not seed it as inert.',
            );
        }

        return [name, verdict];
    }));
}

const ledger = {
    // A note rather than a schema: the shape is enforced by
    // tests/lib/construct-ledger.js, and a second copy of the rules here would
    // be one more thing to keep in step.
    note: 'Generated by scripts/seed-construct-ledger.mjs. Statuses are measured; reasons, notes and '
        + 'tickets are written by hand and carried over. See tests/lib/construct-ledger.js for what '
        + 'each field has to satisfy.',
    verbatimPayload: VERBATIM,
    surfaces: {},
};

for (const [id, surface] of Object.entries(SURFACES)) {
    const root = surface.local ? resolve(here, '..') : process.env[rootVariable(id)];
    const was = previous.surfaces?.[id] ?? {};
    const hits = root && existsSync(root) ? probe(id, root) : null;

    if (!hits) {
        // Not re-measured this run: keep the recorded rows exactly as they are.
        ledger.surfaces[id] = was;
        continue;
    }

    const entries = {};
    for (const { name } of constructs) {
        const old = was.constructs?.[name] ?? {};
        const entry = {};

        if (hits.has(name) && !refuses[id]?.(name, hits.get(name))) {
            entry.status = 'IMPLEMENTED';
            entry.evidence = hits.get(name);
        } else if (INDISTINGUISHABLE[name] && hits.has(INDISTINGUISHABLE[name])) {
            /*
             * The surface names this construct's SIBLING and not it, and the
             * two spellings are one rule wherever a grammar folds them. A name
             * cannot separate them, so the honest reading is "not measured",
             * not "not there" - see INDISTINGUISHABLE in surface-probe.mjs.
             */
            entry.status = 'UNMEASURED';
            entry.ticket = old.ticket || was.gapTicket || '';
        } else if (reasonFor(name, id) && (UNSUPPORTED_ON[name] || []).includes(id)) {
            entry.status = 'UNSUPPORTED';
            entry.reason = old.reason || reasonFor(name, id);
        } else {
            entry.status = 'GAP';
            entry.ticket = old.ticket || was.gapTicket || '';
        }

        if (entry.status !== 'IMPLEMENTED') {
            entry.payload = 'none';
        } else if (!VERBATIM.includes(name)) {
            entry.payload = 'parsed';
        } else if (measured[id]) {
            entry.payload = measured[id][name];
            /*
             * A RECORDED LEAK SURVIVES AN `inert` SAMPLE, because the sample is
             * a FLOOR and not the measurement. `VERBATIM_SAMPLES` is one
             * document per construct; `tests/opaque-payload-test.js` generates
             * hundreds and finds leaks the sample cannot - on both surfaces
             * measured for the first time in carve-grammars#320 the sample said
             * every row was inert and the sweep disagreed on five, and
             * intellij-carve made it three surfaces out of three
             * (carve-grammars#329). Overwriting `leaks` here would have
             * re-seeded those rows back to `inert` and quietly dropped the
             * claim.
             *
             * A FIX STILL CLEARS THE ROW, and does not need this branch to do
             * it: the sweep asserts every `KNOWN_LEAKS` entry STILL leaks, so a
             * fix fails that file, the entry comes out, and the ledger's own
             * orphan check then fails until the cell is corrected too. That is
             * the forcing function, rather than a seeder that cannot tell one
             * sample from the whole space.
             */
            if (entry.payload === 'inert' && old.payload === 'leaks') entry.payload = 'leaks';
            if (entry.payload === 'leaks') {
                entry.payloadNote = old.payloadNote
                    || 'an emphasis run inside the payload is scoped as markup';
                if (old.ticket) entry.ticket = old.ticket;
            }
        } else {
            entry.payload = old.payload === 'inert' || old.payload === 'leaks' ? old.payload : 'unmeasured';
            if (entry.payload === 'leaks' && old.payloadNote) entry.payloadNote = old.payloadNote;
            // A RECORDED LEAK'S TICKET IS CARRIED like every other hand-written
            // field. It was dropped, so re-seeding a surface measured elsewhere
            // turned "leaks, tracked on emacs-carve#19" into an untracked leak.
            if (entry.payload === 'leaks' && old.ticket) entry.ticket = old.ticket;
            if (entry.payload === 'unmeasured') entry.ticket = old.ticket || was.gapTicket || '';
        }

        entries[name] = entry;
    }

    ledger.surfaces[id] = {
        repo: surface.repo,
        commit: surface.local ? 'this repository' : commitOf(root),
        measured: new Date().toISOString().slice(0, 10),
        gapTicket: was.gapTicket || '',
        /*
         * A SENTENCE ABOUT THE WHOLE SURFACE, hand-written and carried over the
         * way a reason and a ticket are.
         *
         * The rows say what each construct is; they cannot say why a surface
         * needed no work to reach zero, or what a measured column does NOT
         * cover. Both readings are ones a later reader gets wrong from the
         * numbers alone - "0 GAP" reads as "somebody implemented nine things"
         * when it can mean "the probe could not see nine folds", and a column
         * of `inert` reads as "no payload leaks here" when the sweep that
         * measures more than one sample per construct may say otherwise.
         * Emitted only where one is written, so it is not an empty field on
         * every surface.
         */
        ...(was.note ? { note: was.note } : {}),
        constructs: entries,
    };
}

writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);

const counts = Object.entries(ledger.surfaces).map(([id, record]) => {
    const values = Object.values(record.constructs || {});
    const by = (status) => values.filter((entry) => entry.status === status).length;

    return `${id.padEnd(20)} ${by('IMPLEMENTED')} implemented  ${by('UNSUPPORTED')} unsupported  `
        + `${by('UNMEASURED')} unmeasured  ${by('GAP')} gap`;
});
console.log(counts.join('\n'));
