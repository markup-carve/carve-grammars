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
import { VERBATIM, VERBATIM_SAMPLES, measure } from '../tests/lib/payload-inertness.js';

const here = dirname(fileURLToPath(import.meta.url));
const LEDGER = resolve(here, '..', 'tests', 'lib', 'construct-ledger.json');

/*
 * The only statuses written by hand.
 *
 * `UNSUPPORTED` is a claim about what a surface can never express, so it cannot
 * be measured - a probe can only report absence, and absence is exactly what
 * `GAP` means. These are the three constructs that carry no marker of their own:
 * a highlighting grammar has nothing to scope, and a structural grammar would be
 * adding a node every consumer then has to skip.
 */
const UNSUPPORTED = {
    blank_line: 'a blank line carries no marker of its own, so there is nothing for this surface to '
        + 'name; it separates blocks and is consumed by the rules around it',
    soft_break: 'a newline inside a paragraph carries no marker, so there is nothing to scope; the '
        + 'line ending is where the next inline run continues',
    paragraph: 'a paragraph is the ABSENCE of a block marker, and this surface scopes markers rather '
        + 'than their absence - prose that matches no rule is already the default',
    /*
     * The eight smart-typography constructs on the Tiptap bridge. The schema
     * map's own `unmapped` section carries this sentence, and the reason is a
     * property of the bridge rather than of the grammar: the engine RESOLVES
     * `--` to an en dash before the bridge sees it, so a node modelling the
     * result would reparse as the resolved character and lose the source
     * spelling. Nothing is dropped - the character is text in the editor - but
     * there is no type for the row to name.
     */
    smart_typography: 'smart-typography output is lossy on reparse, so the bridge does not model it '
        + '(tiptap/schema-map.json, "unmapped"): the engine resolves the source spelling to the '
        + 'resolved character, which the editor holds as text',
};

/** The eight constructs `smart_typography` above is the reason for. */
const SMART_TYPOGRAPHY = [
    'em_dash', 'en_dash', 'braced_en_dash', 'ellipsis', 'smart_quote', 'arrow', 'comparison',
    'typographic_symbol',
];

/** Which surfaces may claim `UNSUPPORTED` for a construct, when the probe finds no name for it. */
const UNSUPPORTED_ON = {
    blank_line: Object.keys(SURFACES),
    soft_break: Object.keys(SURFACES),
    /*
     * The three TextMate surfaces joined this list in carve-grammars#307. They
     * had read IMPLEMENTED on the strength of `markup.underline.text.carve` -
     * the UNDERLINE rule, whose scope path merely ENDS in the letters the
     * `textcarve` signature is - so a construct none of them scopes was green
     * on all three. The reason above is the one Prism and highlight.js already
     * carry, and it is the same reason: these grammars scope markers.
     */
    paragraph: ['prism', 'highlightjs', 'vim-carve', 'textmate', 'vscode-carve', 'intellij-carve'],
    ...Object.fromEntries(SMART_TYPOGRAPHY.map((name) => [name, ['tiptap']])),
};

/** The stated reason a construct may be UNSUPPORTED, by construct name. */
const reasonFor = (name) => UNSUPPORTED[name]
    || (SMART_TYPOGRAPHY.includes(name) ? UNSUPPORTED.smart_typography : undefined);

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
{
    const { prismTokens, hljsTokens } = await import('../tests/lib/engines.js');
    const { textmateEngines } = await import('../tests/lib/surface-engines.js');
    const tokenizers = [['prism', prismTokens], ['highlightjs', hljsTokens], ...await textmateEngines()];
    for (const [id, tokenize] of tokenizers) {
        measured[id] = Object.fromEntries(
            Object.entries(VERBATIM_SAMPLES).map(([name, sample]) => [name, measure(tokenize, sample)]),
        );
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

        if (hits.has(name)) {
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
        } else if (reasonFor(name) && (UNSUPPORTED_ON[name] || []).includes(id)) {
            entry.status = 'UNSUPPORTED';
            entry.reason = old.reason || reasonFor(name);
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
            if (entry.payload === 'leaks') {
                entry.payloadNote = old.payloadNote
                    || 'an emphasis run inside the payload is scoped as markup';
            }
        } else {
            entry.payload = old.payload === 'inert' || old.payload === 'leaks' ? old.payload : 'unmeasured';
            if (entry.payload === 'leaks' && old.payloadNote) entry.payloadNote = old.payloadNote;
            if (entry.payload === 'unmeasured') entry.ticket = old.ticket || was.gapTicket || '';
        }

        entries[name] = entry;
    }

    ledger.surfaces[id] = {
        repo: surface.repo,
        commit: surface.local ? 'this repository' : commitOf(root),
        measured: new Date().toISOString().slice(0, 10),
        gapTicket: was.gapTicket || '',
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
