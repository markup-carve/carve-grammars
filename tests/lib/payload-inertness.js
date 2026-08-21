/**
 * The SECOND axis of the construct ledger, measured rather than asserted.
 *
 * A surface can recognize a construct and still be wrong about it. On four of
 * the five editor surfaces `{% ... %}` was recognized and the payload's markers
 * stayed live, so `{% *not bold* %}` coloured a bold run inside a comment
 * (carve#1239) - worse than leaving the construct unhighlighted, because the
 * output claims something false about the document.
 *
 * So for every construct whose payload is NOT Carve, the sample below puts a
 * live emphasis marker inside that payload and asks the engine what it did with
 * it. A scope naming bold or italic anywhere inside the payload is the defect,
 * whatever else the engine got right.
 *
 * WHY ONLY PRISM AND HIGHLIGHT.JS ARE MEASURED HERE. Those two tokenize in
 * process from `tests/lib/engines.js`, so the measurement is free and cannot go
 * stale - the ledger's value for them is recomputed on every run. TextMate,
 * Tiptap and the six surfaces in other repositories are recorded from a
 * measurement instead, which is what the `unmeasured` payload state and its
 * ticket are for.
 */

/**
 * Constructs whose payload is not parsed as Carve, with a sample that would
 * expose a leak.
 *
 * `payload` is the run that must stay unscoped-as-markup. It is spelled `*b*`
 * everywhere on purpose: one shape to look for, and it is the exact shape that
 * failed on carve#1239.
 */
export const VERBATIM_SAMPLES = {
    code_span: 'a `x *b* y` z\n',
    code_block: '```\nx *b* y\n```\n',
    raw_block: '```=html\n<i>*b*</i>\n```\n',
    raw_inline: 'a `<i>*b*</i>`{=html} z\n',
    literal_inline: 'a !`x *b* y` z\n',
    math_inline: 'a $`x *b* y` z\n',
    math_display: 'a $$`x *b* y` z\n',
    comment_line: '%% x *b* y\n',
    comment_block: '%%%\nx *b* y\n%%%\n',
    inline_comment: 'text %% x *b* y\n',
    braced_comment: 'a {% x *b* y %} z\n',
    autolink: 'a <https://e.example/*b*> z\n',
};

/** The constructs the ledger's `verbatimPayload` list must name, in derived order. */
export const VERBATIM = Object.keys(VERBATIM_SAMPLES);

/** The payload run that must not be scoped as markup. */
export const PAYLOAD = '*b*';

/** Scope names that mean the engine read the payload as emphasis. */
const EMPHASIS_SCOPE = /\b(bold|strong|italic|emphasis)\b/i;

/**
 * What a tokenizer did with the payload of one verbatim construct.
 *
 * @param {(source: string) => Array<{scope: (string|null), text: string}>} tokenize -
 *   A tokenizer from `tests/lib/engines.js`.
 * @param {string} sample - The Carve source.
 * @returns {'inert'|'leaks'} Whether a markup scope opened inside the payload.
 */
export function measure(tokenize, sample) {
    const start = sample.indexOf(PAYLOAD);
    if (start < 0) throw new Error(`sample does not contain ${PAYLOAD}: ${JSON.stringify(sample)}`);
    const end = start + PAYLOAD.length;

    let at = 0;
    for (const leaf of tokenize(sample)) {
        const from = at;
        at += leaf.text.length;
        // Leaves that only touch the payload's edges do not count: the run has
        // to be INSIDE it for the engine to be claiming the payload is markup.
        if (at <= start || from >= end) continue;
        if (leaf.scope && EMPHASIS_SCOPE.test(leaf.scope)) return 'leaks';
    }

    return 'inert';
}
