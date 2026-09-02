/**
 * The per-surface construct ledger, and the rules it has to satisfy.
 *
 * carve-grammars#284: Carve's syntax lives on ten grammar surfaces and nothing
 * measured them against the same construct list, so `{% ... %}` (carve#1239)
 * could land on five of them and be absent from the other five with nothing
 * going red. The ruling on that issue asks for three things, and this file is
 * where each of them is enforced:
 *
 *   1. The construct list is DERIVED (`scripts/spec-constructs.mjs` reads it
 *      out of the spec's normative `resources/grammar.ebnf`), not written here.
 *      A hand-maintained checklist goes stale in exactly the case that matters,
 *      because whoever forgot the grammar rule also forgot the checklist row.
 *   2. Every construct is `IMPLEMENTED` or explicitly `UNSUPPORTED` with a
 *      reason, per surface. A construct in NEITHER column fails, and an empty
 *      reason is a failure rather than an entry - without the third column
 *      every legitimate gap (a Prism tokenizer cannot do what a tree-sitter
 *      grammar does) reads as a defect and the check gets muted within a month.
 *   3. TWO things are tracked per construct, not one: whether the surface
 *      recognizes it, and whether it keeps the construct's payload inert. On
 *      four of the five editor surfaces `{% *not bold* %}` was recognized and
 *      still coloured a bold run inside the comment, which is worse than
 *      unhighlighted.
 *
 * A THIRD STATUS, `GAP`, IS WHAT LETS THE LEDGER LAND SEEDED. The ruling is
 * explicit that a ledger which waits for a green sweep never lands. `GAP` is
 * not a quiet exemption: it means "measured today, no rule found, here is the
 * ticket", and it must carry that ticket. It differs from `UNSUPPORTED` in what
 * it claims - `UNSUPPORTED` says the surface will never have one and says why,
 * `GAP` says nobody has done it yet.
 */

/**
 * The statuses a ledger entry may carry.
 *
 * `UNMEASURED` is the fourth, and it is about the INSTRUMENT rather than the
 * surface: the probe reads names, and five constructs share their name with a
 * sibling (`{/x/}` and `/x/` are two constructs and one rule name). On a
 * surface nobody has read, "no rule found" would be a claim the probe cannot
 * make, so the row says so and carries a ticket. carve-grammars#314; the
 * payload axis grew the same state in carve-grammars#313.
 */
export const STATUSES = ['IMPLEMENTED', 'UNSUPPORTED', 'GAP', 'UNMEASURED'];

/**
 * The payload axis - the second thing tracked per construct.
 *
 * `parsed`     - the payload IS Carve on this surface, so there is nothing to
 *                suppress. Correct for emphasis, links, list items.
 * `inert`      - the payload is not Carve, and this surface keeps it inert.
 * `leaks`      - the payload is not Carve and inner markers stay live anyway.
 *                This is the carve#1239 defect; it needs a note saying what
 *                leaks.
 * `unmeasured` - the surface recognizes a construct with a non-Carve payload
 *                and nobody has measured whether it suppresses it. Needs a
 *                ticket, the same as `GAP`.
 * `none`       - the surface does not implement the construct, so the question
 *                does not arise.
 */
export const PAYLOADS = ['parsed', 'inert', 'leaks', 'unmeasured', 'none'];

/** `owner/repo#N`, or a bare `#N` for a ticket in this repository. */
const TICKET = /^(?:[\w.-]+\/[\w.-]+)?#\d+$/;

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Every rule violation in `ledger`, as human-readable strings.
 *
 * Returning findings rather than throwing is what lets the test drive this
 * over synthetic ledgers and assert that a broken one IS reported - the check
 * has to be seen rejecting something, or "the real ledger is clean" says
 * nothing at all.
 *
 * @param {string[]} constructs - The derived construct names.
 * @param {object} ledger - The parsed ledger document.
 * @returns {string[]} One finding per violation, empty when the ledger is sound.
 */
export function validate(constructs, ledger) {
    const findings = [];
    const live = new Set(constructs);
    const verbatim = new Set(ledger.verbatimPayload || []);

    for (const name of verbatim) {
        if (!live.has(name)) {
            findings.push(`verbatimPayload names "${name}", which the grammar no longer has`);
        }
    }

    for (const [surface, record] of Object.entries(ledger.surfaces || {})) {
        const entries = record.constructs || {};

        // THE COLUMN THAT MUST NOT BE EMPTY. A construct with no entry at all
        // is the whole failure this ledger exists to catch: it is how a new
        // clause reaches five surfaces and misses five more in silence.
        const missing = constructs.filter((name) => !(name in entries));
        if (missing.length) {
            findings.push(
                `${surface}: ${missing.length} construct(s) in neither column - `
                + `${missing.join(', ')}. Classify each as IMPLEMENTED, UNSUPPORTED (with a `
                + 'reason) or GAP (with a ticket).',
            );
        }

        const dead = Object.keys(entries).filter((name) => !live.has(name));
        if (dead.length) {
            findings.push(`${surface}: entries for construct(s) the grammar no longer has - ${dead.join(', ')}`);
        }

        for (const [name, entry] of Object.entries(entries)) {
            if (!live.has(name)) continue;
            const at = `${surface}/${name}`;

            if (!STATUSES.includes(entry.status)) {
                findings.push(`${at}: status ${JSON.stringify(entry.status)} is not one of ${STATUSES.join(', ')}`);
                continue;
            }

            // SHAPE ONLY. That the cited rule actually colours the construct is
            // measured in `tests/construct-ledger-test.js` against
            // `tests/lib/rule-scopes.js`, on every surface this repo can
            // tokenize - this file has no grammar in front of it, and a
            // non-empty string was the whole test until carve-grammars#376.
            if (entry.status === 'IMPLEMENTED' && !nonEmpty(entry.evidence)) {
                findings.push(`${at}: IMPLEMENTED needs evidence - the name the surface gives the construct`);
            }
            if (entry.status === 'UNSUPPORTED' && !nonEmpty(entry.reason)) {
                findings.push(
                    `${at}: UNSUPPORTED with an empty reason is a failure, not an entry - `
                    + 'say what this surface cannot express and why',
                );
            }
            if (entry.status === 'GAP' && !TICKET.test(entry.ticket || '')) {
                findings.push(`${at}: GAP needs a ticket like owner/repo#123, got ${JSON.stringify(entry.ticket)}`);
            }
            if (entry.status === 'UNMEASURED' && !TICKET.test(entry.ticket || '')) {
                findings.push(
                    `${at}: UNMEASURED needs a ticket, the same as a GAP does - it is a blind spot `
                    + `someone has to look at, got ${JSON.stringify(entry.ticket)}`,
                );
            }

            if (!PAYLOADS.includes(entry.payload)) {
                findings.push(`${at}: payload ${JSON.stringify(entry.payload)} is not one of ${PAYLOADS.join(', ')}`);
                continue;
            }
            if (entry.payload === 'leaks' && !nonEmpty(entry.payloadNote)) {
                findings.push(`${at}: payload "leaks" needs a note saying what stays live inside the construct`);
            }
            if (entry.payload === 'unmeasured' && !TICKET.test(entry.ticket || '')) {
                findings.push(`${at}: payload "unmeasured" needs a ticket, the same as a GAP does`);
            }
            if (entry.payload === 'none' && entry.status === 'IMPLEMENTED') {
                findings.push(`${at}: IMPLEMENTED cannot have payload "none" - the question does arise`);
            }
            if (entry.payload !== 'none' && entry.status !== 'IMPLEMENTED') {
                findings.push(`${at}: only an IMPLEMENTED construct has a payload to talk about`);
            }

            // The second axis, where it bites: a construct whose payload is not
            // Carve cannot be `parsed`. Declaring it so is how `{% *not bold* %}`
            // would be recorded as fine while colouring a bold run.
            if (verbatim.has(name) && entry.payload === 'parsed') {
                findings.push(
                    `${at}: "${name}" carries a payload that is not Carve, so "parsed" is not an `
                    + 'answer - it is inert, it leaks, or nobody has measured it',
                );
            }
        }
    }

    return findings;
}
