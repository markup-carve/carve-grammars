/**
 * Marker-line comment fences: the shapes, shared by all three grammars.
 *
 * A `%%%` fence may open on a list item's MARKER line, and spec PART 9 §24 S2
 * with §28 make a comment's body verbatim and invisible WHEREVER the fence
 * sits - so the whole run, opener through closer, is one comment and nothing
 * after it is affected. Corpus 337 pins it:
 *
 *     - %%%
 *       [r]: /url
 *       %%%
 *
 *     [r][]
 *
 * renders `<ul><li></li></ul><p>[r][]</p>`: the definition inside the fence
 * registers nothing, so the trailing `[r][]` stays literal text.
 *
 * ONE TABLE, THREE GRAMMARS, for the reason `tests/textmate-sweep-test.js`
 * already gives about its own inventory: two hand-maintained lists is how a
 * construct ends up covered in one sweep and absent from another. All three
 * grammars in this package were wrong on this shape and each was wrong
 * differently (carve-grammars#243), so a per-grammar list would have been
 * three chances to miss a case.
 *
 * The ORACLE is tree-sitter-carve, the one Carve grammar that gets the shape
 * right: it puts a `fenced_comment_block` inside `list_item_content` - beside
 * the `list_marker_*`, not over it - with the body as a single opaque `content`
 * node. None of the three grammars here could serve as another's oracle.
 *
 * WHAT A CONSUMER MUST ASSERT: both directions.
 *
 * - `hidden` ends up INSIDE a comment scope. Prism did not swallow anything
 *   here - it scoped the hidden reference definition as LIVE syntax - so a
 *   swallow check alone passes straight through its failure.
 * - the block AFTER the fence is in NO comment scope. highlight.js never fired
 *   on `- %%%`, took the real closer for an opener and ran to end of file, so
 *   a hidden-body check alone passes straight through its failure.
 *
 * The TextMate grammar managed both at once: the hidden line looked live and
 * the live line looked hidden.
 */

/** @type {{label: string, src: string, hidden: string, visible: string}[]} */
export const MARKER_LINE_FENCES = [
    { label: 'a dash marker', src: '- %%%\n  [r]: /url\n  %%%\n\nafter\n' },
    { label: 'a star marker', src: '* %%%\n  [r]: /url\n  %%%\n\nafter\n' },
    { label: 'an ordered marker', src: '1. %%%\n   [r]: /url\n   %%%\n\nafter\n' },
    { label: 'a marker run', src: '- - %%%\n    [r]: /url\n    %%%\n\nafter\n' },
    { label: 'a task marker', src: '- [ ] %%%\n      [r]: /url\n      %%%\n\nafter\n' },
    { label: 'a wider fence', src: '- %%%%\n  [r]: /url\n  %%%%\n\nafter\n' },
    { label: 'a fence one item deeper', src: '- a\n  - %%%\n    [r]: /url\n    %%%\n\nafter\n' },
    { label: 'an insignificant tail', src: '- %%% TODO\n  [r]: /url\n  %%% end\n\nafter\n' },
].map((c) => ({ ...c, hidden: '[r]: /url', visible: 'after' }));

/**
 * The counterpart, and the reason a marker-line closer is `[ \t]+` and never
 * `[ \t]*`.
 *
 * A COLUMN-0 line ends the container, and with it an open fence: corpus 326-6
 * renders `c` and `tail` as visible paragraphs, with the unclosed opener
 * degrading to a comment on its own line. So a column-0 `%%%` must not be found
 * as the fence's closer - an over-broad fix that closed on any indent would
 * hide two visible paragraphs to reveal one hidden line.
 *
 * The corpus writes that column-0 line as `c`. Spelled out here instead,
 * because the assertion is a substring test and a single letter is in half the
 * scope names a token stream can carry - it would pass or fail for reasons that
 * have nothing to do with the fence.
 */
export const NOT_CLOSED_AT_COLUMN_0 = {
    src: '- %%%\nvisibleline\n%%%\ntail\n',
    visible: 'visibleline',
};

/**
 * A percent run GLUED to inline content is not a marker-line fence.
 *
 * Only relevant to a grammar that anchors the rule on `\G` (the TextMate one
 * here): the anchor moves with every match on the line, so the rule also has
 * to ask to be preceded by whitespace. Without that guard `- /a/%%%` opened a
 * fence at the end of an emphasis run and hid the rest of the item.
 */
export const GLUED_IS_NOT_A_FENCE = {
    src: '- /a/%%% x\n  b\n\nafter\n',
    visible: 'after',
};

/**
 * The same rule at a BLOCK-QUOTE marker (carve-grammars#245).
 *
 * `> %%%` opens a fence whose body is hidden for the same reason a list item's
 * is - §24 S2 and §28 hide a comment's body WHEREVER the fence sits - and none
 * of the three grammars modelled it either. Corpus 70 pins the spelling:
 *
 *     > q
 *     > %%%
 *     > x
 *     > %%%
 *     > body
 *
 * renders `<blockquote><p>q</p><p>body</p></blockquote>`: `x` is hidden and the
 * quote continues after the closer.
 *
 * MILDER THAN THE LIST CASE, and worth saying which way. Nothing swallowed the
 * rest of the document here, so every failure was a mis-scope: Prism scoped the
 * two `%%%` runs as trailing line comments and left the hidden body as live
 * quote content; highlight.js and the TextMate grammar scoped all three lines
 * as plain quote with no comment scope anywhere.
 *
 * BOTH DIRECTIONS, for the reason the list table above gives: the hidden body
 * carries a comment scope AND the block after the closer carries none. Two of
 * the three failures pass a hidden-body-only check.
 *
 * The ORACLE is tree-sitter-carve again, which puts a `fenced_comment_block`
 * inside the quote's `content`, beside the `block_quote_marker` rather than
 * over it - so the marker keeps its quote scope in all three grammars here.
 */
export const QUOTE_MARKER_LINE_FENCES = [
    { label: 'a quote marker', src: '> %%%\n> [r]: /url\n> %%%\n\nafter\n' },
    { label: 'a nested quote marker', src: '> > %%%\n> > [r]: /url\n> > %%%\n\nafter\n' },
    { label: 'a wider quote fence', src: '> %%%%\n> [r]: /url\n> %%%%\n\nafter\n' },
    { label: 'an insignificant tail on a quote fence', src: '> %%% TODO\n> [r]: /url\n> %%% end\n\nafter\n' },
    { label: 'a marked blank line in the body', src: '> %%%\n> [r]: /url\n>\n> x\n> %%%\n\nafter\n' },
    // Corpus 70's own shape: the fence opens BELOW quote content and the quote
    // goes on after the closer, so `after` is a check on the closer as much as
    // the two shapes above are checks on the opener.
    { label: 'a fence below quote content', src: '> q\n> %%%\n> [r]: /url\n> %%%\n> after\n' },
    { label: 'a quote inside a list item', src: '- a\n  > %%%\n  > [r]: /url\n  > %%%\n\nafter\n' },
    { label: 'a quote inside an admonition', src: '::: note\n> %%%\n> [r]: /url\n> %%%\n:::\n\nafter\n' },
    // The closer matches the opener's width EXACTLY, at a quote marker too: the
    // `> %%%%` inside this fence does not close it, so the definition BELOW it
    // is still hidden and only the real `> %%%` ends the run. Drop the width
    // backreference and the fence closes early, which shows up as the hidden
    // definition scoping live - the direction a bare "did it swallow?" check
    // cannot see. The other direction of the same rule (`> %%%` offered a
    // `> %%%%` closer and staying open) is not assertable across all three:
    // the TextMate grammar cannot demand a closer up front, so an unclosed
    // fence hides the rest of its quote there either way.
    { label: 'a wider run inside the fence', src: '> %%%\n> a\n> %%%%\n> [r]: /url\n> %%%\n> after\n' },
].map((c) => ({ ...c, hidden: '[r]: /url', visible: 'after' }));

/**
 * An UNMARKED line is where a quote can end, and with it an open fence.
 *
 * `> %%%` with no closer degrades to a line comment and leaves its body
 * visible, so nothing below the quote may be hidden. Prism and highlight.js get
 * the whole shape right because both demand the closer up front; the TextMate
 * grammar cannot (a begin sees one line) and still hides the rest of the QUOTE,
 * which is why the assertion is on the line past the quote boundary rather than
 * on the body - the boundary is the part all three can hold.
 *
 * Spelled `visibleline` rather than the corpus's `c` for the reason
 * NOT_CLOSED_AT_COLUMN_0 gives: a single letter is in half the scope names a
 * token stream carries.
 */
export const QUOTE_NOT_CLOSED = {
    src: '> %%%\n> [r]: /url\n\nvisibleline\n',
    visible: 'visibleline',
};

