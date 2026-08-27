/** Real-editor corpus ratchet: schema defaults only appear after mounting. */
import assert from 'node:assert';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { carveToHtml } from '@markup-carve/carve';
import { CarveKit, carveToProseMirror, serializeToCarve } from '../tiptap/index.js';
import { listCorpusFiles } from './lib/corpus.js';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

function normalizeHtml(html) {
    return (html || '')
        .replace(/<([a-z0-9]+)((?:\s[^<>]*?)?)\s*(\/?)>/gi, (_match, tag, attrs, slash) => {
            const parts = (attrs.match(/[\w-]+(?:="[^"]*")?/g) || []).sort();
            return `<${tag.toLowerCase()}${parts.length ? ` ${parts.join(' ')}` : ''}${slash}>`;
        })
        .replace(/\s+/g, ' ')
        .trim();
}

const changed = [];
for (const file of listCorpusFiles()) {
    const editor = new Editor({
        extensions: [CarveKit],
        content: carveToProseMirror(file.source, { unsupported: 'preserve' }),
    });
    try {
        // Strip the lossless source envelope deliberately: this measures the
        // editable projection, which is the path wp-carve's warning gate tests.
        const written = serializeToCarve({ ...editor.getJSON(), attrs: undefined });
        if (normalizeHtml(carveToHtml(file.source)) !== normalizeHtml(carveToHtml(written))) {
            changed.push(file.name);
        }
    } finally {
        editor.destroy();
    }
}

const fixed = [
    '03-links-2',
    '03-links-10',
    '08-image-with-caption-2',
    '13-attributes-3',
    '23-inline-footnotes',
    '26-comments-5',
    '39-inline-span-2',
    '42-admonitions-4',
    '100-table-row-attributes',
    // The engine parses `{lang=de}` on a paragraph and the projection now
    // carries it, so this document became render-equivalent when the
    // `@markup-carve/carve` pin moved. Protected because it is the construct
    // that pin bump exists for.
    '296-a-language-attribute-and-lang-are-one-key-4',
    // A caption on a quote is a figure caption again (markup-carve/carve#1213),
    // so the loader builds a real `carveFigure`/`carveCaption` pair for these
    // four and they are render-equivalent through a mount. Protected because the
    // failure mode is silent content loss on the first edit rather than a
    // visible fallback: the caption would survive only inside the
    // whole-document `carveSource` envelope, which that edit invalidates.
    '05-lists-20',
    '07-blockquote-with-attribution',
    '55-blockquote-caption-after-a-blank-line',
    '282-two-blank-lines-detach-a-caption-5',
    // The three silent losses of markup-carve/carve-grammars#240. Protected
    // because each failed in SILENCE rather than through a visible fallback:
    // `03-links-8` is `[](https://example.com)` alone in a file, which came back
    // as an EMPTY DOCUMENT; `13-attributes-2` is `` `code`{.cls} ``, whose run
    // had no slot on the code mark; `307-...-3` is `x ^[]{.c}`, an empty span
    // the projection wrote back as a bare `x ^`.
    '03-links-8',
    '13-attributes-2',
    '307-an-empty-inline-note-is-literal-3',
    // The value-less attribute (markup-carve/carve-grammars#344). Protected for
    // the same reason as the three above: nothing fell back visibly, the run
    // simply came back `{}` or gone.
    '97-boolean-attributes',
    '97-boolean-attributes-2',
    '292-a-boolean-and-a-key-value-of-the-same-name-are-one-attribute',
    '389-a-boolean-attribute-does-not-start-with-an-underscore',
];
for (const name of fixed) assert.ok(!changed.includes(name), `${name} regressed after editor mount`);
// 177 -> 173 when the `@markup-carve/carve` pin moved onto the withdrawal of
// PART 9 section 4a (markup-carve/carve#1213). Every mover was read:
//
// - Four came back: 05-lists-20, 07-blockquote-with-attribution,
//   55-blockquote-caption-after-a-blank-line and
//   282-two-blank-lines-detach-a-caption-5. carve-js#1033 had made a caption on
//   a quote the quote's own `attribution` field, which the loader read nowhere,
//   so the line survived only in the `carveSource` envelope and the first edit
//   dropped it. The engine emits a `figure` whose target is the quote again, so
//   the loader builds the `carveFigure`/`carveCaption` pair it always did and
//   the four are render-equivalent. They are in the protected list above.
// - Two are the language attribute reaching a place the projection cannot
//   carry it yet: a block-level `{:de}` on a blockquote
//   (294-a-language-attribute-is-exact-sugar-for-lang-3) and the boolean
//   attribute a padded sigil leaves behind (297-the-language-sigil-takes-no-
//   padding). Both were equivalent before only because the old engine read the
//   whole construct as literal text, so neither side knew the attribute
//   existed. Agreement by mutual ignorance is not round-trip fidelity.
// - Two moved the other way and are now equivalent:
//   288-heading-index-plain-text-covers-visible-leaves-and-rejects-an-empty-key
//   and 296-a-language-attribute-and-lang-are-one-key-4, the latter protected
//   above.
// 173 -> 191 when `spec/` moved from 988fdc8 to 49b8deb. The corpus grew by 316
// documents, so the count had to move; what matters is that NOTHING already in
// the corpus moved with it. Keyed by source text rather than by filename, all
// 918 documents present under both pins returned the same verdict - zero flips
// in either direction. The net +18 is 19 new movers minus one source the corpus
// dropped (the old `45-inline-extensions-9`, retired when upstream rewrote that
// category around semantic spans). Every one of the 19 was read:
//
// - Eight are one defect: a link or image whose TEXT holds another anchor. The
//   projection flattens the nesting and moves the inner anchor out behind the
//   outer one - `a [t^[n]](/u) b` comes back as `a [t](/u)[^1] b`, and
//   `a [x ![t[z]][r] y](/u) b` splits the link in two around the image. The
//   reference forms re-emit their definitions a second time on top of that.
//   `310`, `311` (x3), `312-3`, `313-4`, `314` (x3) and `316-3` / `316-8`.
// - Five are the semantic element name, which is authored as a value-less
//   attribute and dropped: `[Ctrl+C]{kbd}` comes back as `[Ctrl+C]{}`, so the
//   rendered element degrades from `kbd` to a plain span. Only the BOOLEAN name
//   is lost - `[x]{#k .key kbd}` keeps its id and class, and `{dfn="a term"}`
//   survives intact. `45-inline-extensions-2` / `-8` / `-10`, `71-attribute-
//   edge-cases-11` and `299-3`.
// - `307-an-empty-inline-note-is-literal-3`: `x ^[]{.c}` is literal text, and
//   the projection writes back a bare `x ^`, losing the run entirely.
// - `318-composite-figures-6`: a caption detached by TWO blank lines is
//   re-emitted after one, which re-attaches it to the group - the exact
//   distinction that document exists to pin.
//
// The other 81 new documents are render-equivalent through a mount, including
// the remaining ten of `318-composite-figures`: the loader builds real
// `carveFigureGroup` nodes holding `carveFigure` panels and a trailing
// `carveCaption`, and they survive the editor.
// 191 -> 184 when the eleven map-declared nodes the converter never built got
// producers (`carveFrontmatter`, `carveLinkRefDef`, `carveSymbol`,
// `carveLiteral`, `carveSubstitution`, `carveRawInline`,
// `carveInlineExtension`, `carveCitation`, `carveCrossref`, `carveInlineNote`,
// `carveSection`). Six documents moved OUT and none moved in:
//
// - `194-2`, `195`, `202`, `266-11`, `266-14`, `266-15`: a link reference
//   definition is a node now, written where the author put it and carrying its
//   own trailing attribute run, instead of being re-derived from the reference
//   that resolved it and appended at the end of the document.
// - one more moved out once an inline ATOM started carrying its marks: an
//   emphasis around a symbol, a math span, a mention or an inline note was
//   dropped entirely on the way back, because only the text path writes a
//   mark's delimiters.
//
// The rest of the list is unchanged, which is the point: every construct that
// gained a rich node kept its mounted projection render-equivalent.
// 184 -> 180 when a list started carrying whether the AUTHOR wrote it loose.
// The serializer could only derive looseness from an item holding more than one
// block, so `- a` / blank / `- b` came back tight - the paragraph inside each
// item lost, which the bridges page names as the first thing HTML cannot hold.
// 180 -> 177 when a `carveDiv` started saying HOW its class was written. One
// ProseMirror node serves both `div` and `admonition`, and nothing in the
// document said which was authored, so `{.sidebar}` above a bare `:::` came
// back as `::: sidebar` - a different document. The same pass writes a
// container's attribute run, which nothing wrote at all: a `{#s}` above a
// container was dropped in silence.
// 177 -> 174 when a mark with no content, and an attribute run on inline code,
// stopped vanishing (markup-carve/carve-grammars#240). Three moved out and none
// moved in:
//
// - `03-links-8` is the whole of `[](https://example.com)`. A ProseMirror mark
//   needs text to attach to, so the link had nowhere to land and the document
//   came back EMPTY. It is a `carveEmptyMark` atom now, written back with its
//   destination, title and attribute run.
// - `13-attributes-2` is `` `code`{.cls} ``. The stock Code mark declares no
//   attributes, so the run was dropped on the way in and the serializer had
//   nothing left to write. The mark carries the slots now.
// - `307-an-empty-inline-note-is-literal-3` is `x ^[]{.c}`, an EMPTY SPAN, the
//   same defect as the link: it came back as a bare `x ^`.
//
// Note what this gate could not see, which is why all three survived it for so
// long: it compares RENDERED HTML with its attributes sorted. That comparison is
// blind to the order an attribute run was written in - the third defect in the
// same issue - so `{key=c .a #b}` returning `{#b .a key="c"}` never showed up
// here and never could. The round-trip gates compare the reparsed AST, which
// used to strip `order` as volatile for the same reason. It does not any more.
// 174 -> 198 with the spec bump to carve b6917ab. Attributed before it was
// raised, the same way the envelope ratchet was: the fourteen categories the
// bump added (321 through 334) account for all 24, and the pre-existing
// categories still account for exactly 174. No document that used to render
// equivalently stopped doing so.
// 198 -> 239 with the spec bump to carve 287b4b8. Attributed before it was
// raised, the same way as above, and keyed by SOURCE TEXT rather than by
// filename so a renumber cannot be mistaken for a mover: of the 1123 source
// texts present under both pins, ZERO flipped in either direction. The
// pre-existing corpus still accounts for exactly 198, and all 41 of the rise
// are new documents.
//
// The 41 concentrate in the rulings the bump carries, which is the honest
// reading of them: seven in the column-0-line-after-a-container category, five
// each in the bracketed-construct-spanning-a-line-boundary and
// block-at-a-container's-content-column categories, four each in
// definition-at-a-container's-content-column and
// container-whose-table-ends-on-a-continuation-row, three each in the two
// line-block backslash categories, and the rest in ones and twos. The
// projection does not model those constructs richly yet, so they keep their
// source and are protected fallbacks rather than silent losses.
//
// The pin then moved again to 0490ae5, which adds category 359 and two more
// documents. The count does NOT move: both are render-equivalent through a
// mount, so 239 covers 1241 documents rather than 1239.
//
// 239 -> 240 with the spec bump to carve 0f6b990. That bump adds category 360
// and its four documents and touches no existing corpus file, so the
// pre-existing 1241 still account for exactly 239 by construction and the one
// mover is among the four. It is the `-3` variant, the same document that
// starts riding the source envelope in tests/roundtrip-test.js, and the two
// gates agree for the same reason. Its innermost block is a heading behind an
// alternating list/quote prefix:
//
//     - > - - x
//       >     # h
//
// Written back through a mount, the prefix is respelled and a blank quote line
// appears between the item text and the heading, so the heading leaves the
// item it was written into and the render differs. A protected fallback, not a
// silent loss: the envelope keeps the source. The three sibling variants, whose
// innermost block is a link reference or footnote definition, are
// render-equivalent because a definition leaves the flow entirely.
//
// 240 -> 239 when the `@markup-carve/carve` pin moved 83 commits onto carve-js
// main (2dc3232e). The headline is the least informative number in this file:
// 24 documents came IN and 25 went OUT. Reported in both directions for that
// reason. The corpus is unchanged in this bump, so every mover is the engine,
// and 50 of the 51 documents that move either ratchet are documents the new
// engine reads differently - measured by re-rendering each one under both
// pins, not inferred from the category names.
//
// The 25 leaving are the container-content-column family the engines fixed for
// this release (markup-carve/carve#1364 and siblings): ten in `326`, three each
// in `349`, `350` and `357`, two in `355`, one each in `327`, `329`, `344` and
// `345`. Twenty-three of the twenty-five. The projection did not improve; the
// engine started parsing them correctly, and the projection was already right.
//
// The 24 arriving are the same four clusters the envelope ratchet records
// (`322` x5, `319` x4, `348` x3, `353` x3, `326` x2, `323` x1, `344` x1), plus
// two this gate sees and the envelope does not:
//
// - Four `321-delimited-comments`. NOT a regression: carve-js main implements
//   `{% ... %}` and the pinned engine did not, so a `comment` node exists in
//   the tree where before there was nothing to lose. The tree-sitter grammar
//   modelled the construct first, which is markup-carve/carve-grammars#247.
//   What this gate is now reporting is a real serializer defect the node
//   exposed: `carveCommentInline` carries a `delimited` attribute that the
//   serializer ignores, so `foo {% bar %} baz` is written back as the LINE
//   comment `foo %% bar`, and everything after the comment on that line is
//   destroyed. The four are enveloped, so the source survives until the first
//   edit. Raised separately rather than fixed inside a pin bump.
// - `337-a-comment-fence-opened-on-an-item-s-marker-line-hides-its-body-too` is
//   the ONE mover of the fifty-one whose source both engines read identically.
//   It moved because the engine changed its reading of what the serializer
//   WRITES: the marker line comes back as `-   %%%`, padding the content column
//   to 4, and a body line at column 2 no longer reaches it, so the fence is
//   unterminated and `[r]: /url` escapes as a paragraph. Same content-column
//   family as the departures, seen from the writing side.
//
// The `fixed` list above did not fire. Not one of the seventeen guarded
// documents regressed under the new engine - not the three silent losses of
// markup-carve/carve-grammars#240, not the four caption-on-a-quote documents,
// not `296-a-language-attribute-and-lang-are-one-key-4`. Worth stating rather
// than leaving implied: those are the failures that happen in SILENCE instead
// of behind a visible fallback, so this list staying quiet across an 83-commit
// engine move is the strongest single signal in the measurement.
//
// Marker-line block serialization and attribute placement reduce the protected
// fallback population from 251 to 203. Four documents in the six categories
// added by carve c5e874d change under the mounted rich projection, taking the
// population to 207. The four collected-definition documents in the next pin
// also need the protected source envelope; inherited table alignment does not,
// taking the measured population to 211. Pin both directions: an unexplained increase is a
// regression, while a decrease must retire its stale reasons.
//
// The bump to bfec478 takes it to 230. The nineteen added are all in the
// fourteen NEW categories, and the pre-existing population is still exactly
// 211 - counted, not inferred, by splitting the changed list on the category
// prefix, so nothing flipped in either direction under the new engine:
//
//     376 head-and-foot-row-counts          1   382 marker-line-link-def     1
//     377 unclosed-inline-literal           3   383 lazy-marker-line-def     2
//     379 reference-definition-destination  2   384 continuation-flush-left  1
//     380 terminal-comment-line-verse       1   388 empty-brace-pair         1
//     381 resumed-lazy-run                  4   389 boolean-attr-underscore  3
//
// Every one is a definition, a marker-line collection or an attribute
// placement - the three families this projection has never held structurally.
// The inline rulings in the same pin (385 hyphen-run flags, 386 canonical
// arrows, 387 braced en dash, 378 terminal comment in a quote) add nothing
// here, which is the expected shape: an inline ruling does not disturb the
// block projection.
//
// The bump to e88d6e3 takes it to 233, and again the pre-existing population is
// still exactly 230 - counted by splitting the changed list on the category
// prefix, not inferred - so nothing flipped in either direction:
//
//     391 attribute-line-below-a-list-item        1
//     394 leading-escaped-caret-keeps-its-escape  1
//     396 idle-escape-does-not-spread             1
//
// 391 is the attribute-placement family already named above. The other two are
// a FOURTH family, and worth naming rather than folding into the three: they
// are ESCAPE SPELLING - `\^ not a caption` under an image, and the escaped
// opener of an indented `## H`. The projection holds the text, not the
// backslashes the writer chose for it, so an escape ruling moves this count the
// way a definition does. The seven other new categories add nothing here: 390,
// 392 and 393 are inline or cell-local, and 395, 397, 398 and 399 are block
// EXTENT or a character the parser replaces before anyone reads it.
//
// The bump to d0b6c92 takes it to 234, measured the same way: the changed list
// was dumped under both pins (e88d6e3 and d0b6c92) and diffed by name. Exactly
// ONE name is added and NONE is removed, so the pre-existing population is
// still exactly 233, document for document.
//
//     403 idle-escape-does-not-spread-from-the-occurrence  1
//
// It is the same document that moves the envelope ratchet in
// tests/roundtrip-test.js, for the same reason, and it belongs to the ESCAPE
// SPELLING family named above. The source is two lines indented by one space,
// where `{.note}` is paragraph TEXT. This test strips the envelope on purpose,
// so the projection writes both lines at column 0 - and there `{.note}` is an
// attribute block. Measured rather than reasoned:
//
//     source     -> <p>{.note}\nThis paragraph.</p>
//     projection -> <p class="note">This paragraph.</p>
//
// So it is a protected fallback in the exact sense this count exists to track:
// the indent is load-bearing, the projection has no slot for it, and the
// envelope is what keeps the document from being silently reinterpreted. The
// other six categories the bump added move nothing here - they are block
// EXTENT rulings or marker-separator rulings, and a separator run the parser
// already consumed does not disturb the projection.
//
// The bump to f7cf0b3 takes it to 240, measured the same way: the changed list
// was dumped under both pins (ca9da8a and f7cf0b3) and diffed by name. SIX
// names are added and NONE is removed, so the pre-existing population is still
// exactly 234, document for document. The bump is purely additive - fourteen
// documents, no corpus file modified or deleted - and the six are the same six
// that move the envelope ratchet in tests/roundtrip-test.js.
//
//     407 one-consumed-boolean-spells-the-looseness     2
//     409 a-blank-line-loosens-an-item-only-when-a-...  2  (-2, -3)
//     410 a-footnote-continuation-survives-a-blank-run  1  (-4)
//     362 an-unterminated-container-does-not-extend-... 1  (-5)
//
// They are one family, and it is a FIFTH one: ITEM LOOSENESS, and which blank
// line spells it. Each was re-rendered under the stripped projection rather
// than reasoned about:
//
//   - `407` is the boolean `{loose}` itself. The projection has no slot for a
//     boolean attribute on a list, so it is dropped and the looseness goes with
//     it: `<li><p>Note text.</p></li>` comes back `<li>Note text.</li>`, and
//     the definition-list variant loses its `loose=""` outright.
//
//   - `409-2`, `409-3` and `362-5` move the other way. The projection stores an
//     item's BLOCKS, not the record of which construct consumed a blank run, so
//     writing the item back respells the run and a tight item comes back loose:
//     `<li>x <blockquote>...` becomes `<li><p>x</p> <blockquote>...`.
//
//   - `410-4` is the largest, and it is a modeling gap rather than a spelling
//     one: a footnote definition whose body opens a LIST on the marker line has
//     no projection at all, so `[^1]: - a` is written back as paragraph text
//     and the whole endnote section disappears. Same shape as the marker-line
//     comment fence already named above, and the envelope is what keeps the
//     document from being silently reinterpreted.
//
// The other eight documents the bump adds move nothing here: `408` is the pair
// that pins where a blank line CANNOT spell looseness, and the remaining `409`,
// `410` and `362` variants put their blank run outside an item or somewhere it
// is not load-bearing.
//
// 240 -> 223 when a VALUE-LESS attribute started coming back as its bare name
// (markup-carve/carve-grammars#344). Attributed before it was lowered, by the
// same method: the changed list was dumped under both trees and diffed by name,
// and SEVENTEEN names left while ZERO entered. The seventeen are exactly the
// seventeen that leave the envelope ratchet in tests/roundtrip-test.js, and
// every one of them is a document whose attribute run holds a name with no
// value - the one thing the fix changed. The three groups are the boolean
// categories themselves (`97` x2, `389` and `-3` / `-4`, `292`), the SEMANTIC
// ELEMENT NAME (`45-inline-extensions-2` / `-8` / `-9` / `-10`,
// `71-attribute-edge-cases-11`, `293-...-3` / `-4`, `299-...-3`) and the
// padded language sigil's leftover (`297`), plus `407` and `-2`.
//
// TWO OF THOSE GROUPS WERE ALREADY NAMED HERE as known losses, one release
// before the ticket that made fixing them urgent - see the `184 -> 198` note's
// "Five are the semantic element name, which is authored as a value-less
// attribute and dropped". `{loose}` is the same defect landing on a construct
// where losing it changes what the document MEANS, which is what turned a
// styling nuisance into a content loss. All of them are protected in the
// `fixed` list above now, so the fix cannot silently come undone.
//
// It also settles the reading in the `407` entry above: the projection was said
// to have "no slot for a boolean attribute on a list". Measured, the slot is
// there and survives a mount - `bulletList` declares `carveKeyValues` and
// `carveAttrOrder` - and it was the SERIALIZER that dropped it. The definition
// list was the one with no slot, and it lost the run one stage earlier still,
// in the converter.
//
// 223 -> 276 at the carve e3b0333 corpus pin. The bump added 84 documents and
// the writer simultaneously moved definition descriptions from `:  ` to the
// canonical `: `, which the 0.1.4 engine had not learned, so its mounted
// comparison counted those projections as changed. That entry said the number
// was temporary and that a later engine had to force it down.
//
// 276 -> 232 on carve-js 0.1.5, which is that engine. The 44 recovered are the
// definition spelling; nothing in this package changed to earn them. What
// remains is not one backlog: 108 turn on source position (content columns,
// lazy continuation, flush-left folding), 21 on constructs spanning a line or
// verse boundary, and 11 are deliberately malformed documents that must stay
// literal. An editable projection has no slot for "this line sits at column 3
// and therefore folds", so those are the warning gate's job rather than this
// ratchet's. The rest are ordinary serializer defects and are worth fixing.
//
// 232 -> 230 with two of those defects fixed. A LOOSE list of one item had
// nowhere to put the blank lines that normally spell looseness, so it read
// back tight; it writes `{loose}` now. And a definition list's looseness moved
// out of the attribute run into the node's own flag, where the converter was
// not looking - it is folded back into the run, which is the shape the rest of
// the pipeline already writes.
//
// 230 -> 201 on two more, and the size of that step is the point: both were
// single defects reached by a great many documents.
//
// The continuation escaper knew `>` and `#` and none of the other seven shapes
// that open a block at column 0, so a lazy line holding a list marker, a
// thematic break, a colon fence, a definition term or a table row became that
// block when written back - `1. outer` with a lazy `  1. inner` under it came
// back as two items where the source had one.
//
// And a description holding more than one block got a `: ` marker per block,
// which spells a NEW description each time: a two-paragraph definition came
// back as two definitions of the same term.
assert.strictEqual(changed.length, 201, `mounted rich projection changed for ${changed.length} corpus documents`);
console.log(`mounted Tiptap corpus: ${listCorpusFiles().length - changed.length}/${listCorpusFiles().length} render-equivalent; ${changed.length} protected fallbacks`);
