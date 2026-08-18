/**
 * An UNTERMINATED `%{3,}` run: the shapes, shared by all three grammars.
 *
 * PART 9 S28 - a `%%%` run with no matching closer opens NOTHING. It degrades
 * to a line comment, so the run itself is greyed out and everything below it
 * stays VISIBLE. Measured against carve-js at tree-sitter-carve's pin rather
 * than read off the spec:
 *
 *     %%%
 *
 *     after
 *
 * renders `<p>after</p>` - the opener vanished, the paragraph did not. The same
 * holds at every indent, a tab included, and inside a list item or a quote.
 *
 * THE WIDTH RULE IS THE SAME RULE FROM THE OTHER SIDE. A closer must repeat the
 * opener's run exactly, so `%%%` offered a `%%%%` closer is unterminated too:
 *
 *     %%%
 *     visibleline
 *     %%%%
 *
 *     after
 *
 * renders `<p>visibleline</p><p>after</p>` - two vanished runs with a VISIBLE
 * paragraph between them, which is the opposite of what a fence would do.
 *
 * WHY THIS IS ITS OWN TABLE. Every existing `%%%` case in this package supplies
 * a closer, so nothing exercised the unterminated shape at all, and highlight.js
 * ran an unclosed opener to end of file at every indent - column 0 included -
 * greying out the whole document below one stray run (carve-grammars#260). That
 * is the worst failure a highlighter has, and it survived a full suite because
 * no case ever omitted the closer.
 *
 * WHAT A CONSUMER MUST ASSERT: both directions.
 *
 * - `visible` carries NO comment scope. This is the direction highlight.js
 *   failed, and it is the only one that can see a runaway.
 * - the RUN ITSELF still carries one. A grammar that simply refused to match an
 *   unterminated opener would pass the first direction while losing the run,
 *   where the engine greys it out - and Prism already carries a dedicated
 *   unterminated-run pattern placed after its block form for exactly this.
 */

/** @type {{label: string, src: string, visible: string, run: string, skip?: object}[]} */
export const UNTERMINATED_FENCES = [
    { label: 'a column-0 run', src: '%%%\n\nvisibleline\n', run: '%%%' },
    { label: 'an indented run', src: '  %%%\n\nvisibleline\n', run: '%%%' },
    { label: 'a tabbed run', src: '\t%%%\n\nvisibleline\n', run: '%%%' },
    { label: 'a run with a body under it', src: '%%%\nvisibleline\n\nafter\n', run: '%%%' },
    { label: 'a wider run offered as the closer', src: '%%%\nvisibleline\n%%%%\n\nafter\n', run: '%%%%' },
    { label: 'a run on a list item marker line', src: '- %%%\n  visibleline\n\nafter\n', run: '%%%' },
    { label: 'a run on a quote marker line', src: '> %%%\n> visibleline\n\nafter\n', run: '%%%' },
].map((c) => ({ ...c, visible: 'visibleline' }));

/**
 * Every entry's needles must actually be IN its source. Three rows here were
 * first written with `after` as the paragraph below the run while the shared
 * `visible` was `visibleline`, so the assertions looked for a string no line
 * carried - which reads as "nothing was swallowed" in a check that asks whether
 * the needle is inside a comment scope, and as a pass in the two that ask
 * whether it is outside one. A table typo that makes three checks unfalsifiable
 * is exactly the failure this package keeps finding, so it is caught here once
 * rather than in each of the three consumers.
 *
 * Spelled `visibleline` rather than a short word for the reason
 * NOT_CLOSED_AT_COLUMN_0 gives: a single letter is in half the scope names a
 * token stream carries.
 */
for (const { label, src, visible, run } of UNTERMINATED_FENCES) {
    if (!src.includes(visible)) {
        throw new Error(`UNTERMINATED_FENCES["${label}"] has no ${JSON.stringify(visible)} in its source`);
    }
    if (!src.includes(run)) {
        throw new Error(`UNTERMINATED_FENCES["${label}"] has no ${JSON.stringify(run)} in its source`);
    }
}

/**
 * THE TEXTMATE GRAMMAR CANNOT DEMAND THE CLOSER, and that is a measured refusal
 * rather than an omission.
 *
 * Prism and highlight.js both require a matching closer in the OPENER's own
 * pattern, which is what lets them decline an unterminated run and fall through
 * to a line comment. A TextMate `begin` is matched against ONE LINE, so there is
 * no lookahead that can reach a closer several lines down - the same limitation
 * `tests/lib/marker-line-fences.js` already records for the marker-line and
 * quote-marker fences, where an unclosed opener still hides the rest of its own
 * container.
 *
 * The marker-line rules bound the damage with a zero-width CONTAINER boundary on
 * their `end`. At document level there is no container to end at, and a blank
 * line is not a boundary either: a fence body spans blank lines in the engine
 * (`%%%` / `a` / blank / `b` / `%%%` renders nothing), so ending there would hide
 * a closed fence's own body instead.
 *
 * So the TextMate rows are recorded, not asserted, and they are recorded per
 * shape rather than as a blanket skip - if the engine ever gains a bound this
 * can be reached with, the list is what says which shapes to re-check.
 */
export const TEXTMATE_CANNOT_BOUND =
    'a TextMate begin sees one line, so the closer cannot be required up front, and there is no '
    + 'container boundary at document level to end an unclosed run at (a fence body spans blank lines)';
