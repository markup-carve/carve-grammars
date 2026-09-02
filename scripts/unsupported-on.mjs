/**
 * WHICH SURFACE MAY CLAIM `UNSUPPORTED`, AND THE REASON EACH CLAIM RESTS ON.
 *
 * Split out of `seed-construct-ledger.mjs` so it can be READ without being RUN.
 * That file is a script: importing it re-measures every available surface and
 * writes `tests/lib/construct-ledger.json` at module scope. So a test that
 * imported it to read one table would rewrite the very file it was about to
 * validate - failing on a read-only checkout, and, worse, validating freshly
 * regenerated data instead of what is committed. Found in review on
 * carve-grammars#332, in the commit that first needed the table from a test.
 *
 * Nothing here has a side effect. The seeder imports it, and
 * `tests/construct-ledger-test.js` imports it to assert the committed ledger
 * records no UNSUPPORTED row this table would refuse to write again.
 *
 * @module scripts/unsupported-on
 */
import { SURFACES } from './surface-probe.mjs';

/*
 * The only statuses written by hand.
 *
 * `UNSUPPORTED` is a claim about what a surface can never express, so it cannot
 * be measured - a probe can only report absence, and absence is exactly what
 * `GAP` means. These are the three constructs that carry no marker of their own:
 * a highlighting grammar has nothing to scope, and a structural grammar would be
 * adding a node every consumer then has to skip.
 */
export const UNSUPPORTED = {
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
    /*
     * THE SAME CONSTRUCT, A DIFFERENT REASON, ON EVERY SURFACE THAT SCOPES
     * MARKERS. markup-carve/emacs-carve#23 ruled it for that mode and the
     * argument is a property of the construct, not of emacs: a smart quote is
     * every straight quote and apostrophe in prose, so a rule would paint the
     * apostrophe of every contraction and cannot tell the quote an author means
     * from the one inside a word.
     *
     * The three grammars here were recorded IMPLEMENTED on the strength of the
     * typography rule's NAME until carve-grammars#376 measured them; not one
     * scopes a bare quote, and none should.
     */
    smart_quote: 'a smart quote is every straight quote and apostrophe in prose, so a rule would '
        + 'paint the apostrophe of every contraction and cannot tell the quote an author means from '
        + 'the one inside a word (markup-carve/emacs-carve#23)',
};

/** The eight constructs `smart_typography` above is the reason for. */
export const SMART_TYPOGRAPHY = [
    'em_dash', 'en_dash', 'braced_en_dash', 'ellipsis', 'smart_quote', 'arrow', 'comparison',
    'typographic_symbol',
];

/** Which surfaces may claim `UNSUPPORTED` for a construct, when the probe finds no name for it. */
export const UNSUPPORTED_ON = {
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
    /*
     * emacs-carve joined the smart-quote row in carve-grammars#330, and it is
     * NOT the bridge's reason: markup-carve/emacs-carve#23 ruled that the
     * construct is every straight quote and apostrophe in prose, so a rule
     * would paint the apostrophe of every contraction and cannot tell the quote
     * an author means from the one inside a word.
     *
     * IT IS SPELLED OUT HERE BECAUSE THE LEDGER ALONE COULD NOT HOLD IT. This
     * table is the seed's permission list, and a surface missing from it has
     * its UNSUPPORTED row rewritten to GAP on the next re-measurement - reason
     * and all - which is exactly what this file's own docblock promises never
     * happens. Measured on carve-grammars#332: re-seeding emacs-carve reverted
     * that ruling silently, and it would have shipped in the same commit that
     * re-measured the surface. `tests/construct-ledger-test.js` now refuses a
     * committed UNSUPPORTED row this table does not permit, so the two records
     * cannot drift apart again.
     */
    smart_quote: ['tiptap', 'emacs-carve', 'textmate', 'prism', 'highlightjs'],
};

/**
 * The stated reason a construct may be UNSUPPORTED, by construct and surface.
 *
 * @param {string} name - the construct.
 * @param {string} [id] - the surface, for the constructs whose reason differs by surface.
 * @returns {string|undefined} the reason, or undefined when there is none.
 */
export const reasonFor = (name, id) => {
    // `smart_quote` carries TWO reasons, and which one applies is a property of
    // the surface: the Tiptap bridge does not model smart typography at all,
    // and a highlighting grammar could but must not.
    if (name === 'smart_quote' && id !== 'tiptap') return UNSUPPORTED.smart_quote;

    return UNSUPPORTED[name] || (SMART_TYPOGRAPHY.includes(name) ? UNSUPPORTED.smart_typography : undefined);
};
