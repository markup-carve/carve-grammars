/**
 * Tiptap serializer round-trip test (#6).
 *
 * For each corpus file we run the AST idempotence loop:
 *
 *     source -> parse -> astA -> astToProseMirror -> serializeToCarve -> reparse -> astB
 *
 * and assert normalize(astA) deepEqual normalize(astB). This catches serializer
 * drift: any change that makes the serializer emit Carve that re-parses to a
 * different document fails here.
 *
 * The test is driven by the coverage matrix:
 * - Every file in a COVERED category MUST round-trip. A failure is a hard error.
 * - Every SKIPPED category must genuinely fail to round-trip (throw in the
 *   converter, or produce a different AST) for at least one file. If a skipped
 *   category round-trips cleanly for all its files, the test FAILS and tells the
 *   maintainer to promote it to covered, so skips cannot rot into stale excuses.
 */
import assert from 'node:assert';
import { parse } from '@markup-carve/carve';
import { listCorpusFiles, listCategories } from './lib/corpus.js';
import { astToProseMirror, carveToProseMirror } from '../tiptap/index.js';
import { normalizeAst } from './lib/ast-normalize.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { COVERAGE, isCovered, skipReason, slugOf } from './lib/coverage.js';

console.log('carve-grammars serializer round-trip:');

const liveSlugs = new Set(listCategories().map(slugOf));
const filesByCategory = new Map();
for (const f of listCorpusFiles()) {
    if (!filesByCategory.has(f.category)) filesByCategory.set(f.category, []);
    filesByCategory.get(f.category).push(f);
}

/** Round-trip a single file. Returns {ok: true} or {ok: false, reason}. */
function roundTrip(file) {
    let astA;
    try {
        astA = parse(file.source);
    } catch (e) {
        return { ok: false, reason: `parse failed: ${e.message}` };
    }
    let carve2;
    let wholeDocumentFallback = false;
    try {
        // Exercise the public, source-aware loader. Unsupported constructs are
        // represented by CarveUnsupported atoms carrying their exact source,
        // so an editor can preserve them losslessly even before it has a rich,
        // editable node for each construct. Converting the detached AST here
        // discarded that source and made the documented preservation mode
        // unreachable from the corpus sweep.
        const pm = carveToProseMirror(file.source, { unsupported: 'preserve' });
        wholeDocumentFallback = pm.content?.length === 1
            && pm.content[0]?.type === 'carveUnsupported'
            && pm.content[0]?.attrs?.carveSource === file.source;
        // Whether the loader had to wrap the document in a SOURCE ENVELOPE: the
        // rich projection is kept but is not write-identical, so the source
        // rides along and the first edit is what starts writing the projection.
        if (pm.attrs?.carveSource) envelopedFiles.push(file.name);
        carve2 = serializeToCarve(pm);
    } catch (e) {
        return { ok: false, reason: e.nodeType ? `unsupported ${e.nodeType}` : e.message };
    }
    const astB = parse(carve2);
    try {
        assert.deepStrictEqual(normalizeAst(astA), normalizeAst(astB));
    } catch {
        return { ok: false, reason: 'reparse AST differs (not idempotent)' };
    }
    return { ok: true, wholeDocumentFallback };
}

let failures = 0;
let coveredFilesChecked = 0;
const skipShouldPromote = [];
const wholeDocumentFallbackCategories = new Set();
const envelopedFiles = [];

for (const category of listCategories()) {
    const files = filesByCategory.get(category) || [];
    const covered = isCovered('tiptap', category);

    if (covered) {
        const bad = [];
        for (const f of files) {
            const r = roundTrip(f);
            coveredFilesChecked++;
            if (r.wholeDocumentFallback) wholeDocumentFallbackCategories.add(category);
            if (!r.ok) bad.push(`${f.name}: ${r.reason}`);
        }
        if (bad.length) {
            failures++;
            console.log(`  ✗ ${category} (COVERED) failed to round-trip:`);
            for (const b of bad) console.log(`      - ${b}`);
        } else {
            console.log(`  ✓ ${category} (${files.length} file${files.length === 1 ? '' : 's'})`);
        }
    } else {
        // Skipped: confirm it really does not round-trip for at least one file.
        const allOk = files.every((f) => roundTrip(f).ok);
        if (allOk) {
            skipShouldPromote.push(category);
        }
        const reason = skipReason('tiptap', category) || '(no reason)';
        console.log(`  - SKIP ${category}: ${reason}`);
    }
}

console.log('');
console.log(`  covered files checked: ${coveredFilesChecked}`);
const coveredCategoryCount = listCategories().filter((category) => isCovered('tiptap', category)).length;
console.log(`  covered categories: ${coveredCategoryCount}, skipped: ${COVERAGE.tiptap.skip.size}`);
console.log(`  structured/source-local: ${coveredCategoryCount - wholeDocumentFallbackCategories.size}, whole-document fallback: ${wholeDocumentFallbackCategories.size}`);

/*
 * A FALLBACK ENTRY THAT NO LONGER FALLS BACK.
 *
 * `COVERAGE.tiptap.fallback` records, per category, the concrete reason its
 * structured conversion is not lossless. Two gates read it today: the coverage
 * matrix checks that covered+fallback classify every LIVE category, and that
 * each entry carries a non-empty reason. Both ask whether the entry is
 * well-formed. Neither asks whether it is still TRUE.
 *
 * That is the one-sided shape this repository has already been bitten by in the
 * snapshot goldens, and the sibling grammar states the principle outright: a
 * reason nobody points at is an excuse that outlived the gap it excused. A
 * fallback entry is worse than an unexplained one, because it reads as a
 * measured limitation - "table captions are dropped on serialize", "the
 * converter has no node type for `comment`, so it throws" - long after the
 * mapping that closed it landed. The next person planning work reads a map of
 * gaps, and a quarter of it is a map of gaps that were fixed.
 *
 * The observable test, given every category is covered and hard-asserted above:
 * a category whose structured conversion is genuinely lossy has at least one
 * file riding the SOURCE ENVELOPE, because that is what the loader does when the
 * projection is not write-identical. Zero enveloped files means the projection
 * is faithful for the whole category and the entry has nothing left to explain.
 *
 * Measured when this was added: 34 of the 133 entries were in exactly that
 * state, and are promoted to `covered` in the same change.
 */
{
    const envelopedCategories = new Set(
        envelopedFiles.map((name) => slugOf(name.replace(/-\d+$/, ''))),
    );
    const fallbackShouldPromote = [];
    for (const key of COVERAGE.tiptap.fallback.keys()) {
        const slug = slugOf(key);
        // Only judge categories the live corpus still has; a stale KEY is the
        // coverage matrix's job, not this one.
        if (!liveSlugs.has(slug)) continue;
        if (!envelopedCategories.has(slug)) fallbackShouldPromote.push(key);
    }
    if (fallbackShouldPromote.length) {
        console.log('\nThe following FALLBACK categories are written back faithfully for every file.');
        console.log('Their recorded reason no longer describes anything. Move each to');
        console.log('tiptap.covered and delete the reason:');
        for (const c of fallbackShouldPromote.sort()) console.log(`    - ${c}`);
        failures++;
    }
}

if (skipShouldPromote.length) {
    console.log('\nThe following SKIPPED categories now round-trip cleanly for every file.');
    console.log('Promote them to tiptap.covered (and drop the skip reason):');
    for (const c of skipShouldPromote) console.log(`    - ${c}`);
    failures++;
}

assert.strictEqual(failures, 0, `${failures} round-trip check group(s) failed (see above)`);

/*
 * How many documents the loader could not write back FAITHFULLY, as a ratchet.
 *
 * Every round trip above passes whether or not the projection is any good:
 * `preserve` reacts to a lossy projection by keeping the source and replaying
 * it, so a serializer that writes the wrong thing still reparses to the same
 * AST. The sweep kept measuring and stopped being able to say no. Measured
 * while proving the fixes in markup-carve/carve-grammars#240: a deliberately
 * broken `#id` token - every attributed document in the corpus written back
 * with the wrong id - left this file completely green.
 *
 * The envelope count is the number that moves. Under that same broken `#id` it
 * goes 254 -> 291. It is not a pass/fail property (an enveloped document is
 * still stored losslessly), which is why it is a RATCHET: raising it means the
 * editable projection got worse for that many documents, and that is a decision
 * to state, not a number to absorb.
 *
 * 256 -> 254 in the pass that carried an attribute run's authored order, an
 * attribute run on inline code, and a mark with no content. Two moved out:
 * `03-links-8` (`[](https://example.com)`) and `13-attributes-2`
 * (`` `code`{.cls} ``). Seven fence-title documents moved IN and back out
 * again: with `order` no longer stripped as volatile, the duplicate
 * `{title="..."}` line the code-block writer had always emitted became visible,
 * and it is gone.
 *
 * 254 -> 289 with the spec bump to carve b6917ab, and the whole rise is NEW
 * corpus. The number alone cannot say that - a bump adds documents and worsens
 * the projection in the same step, and the sum looks identical either way - so
 * it was measured per category: the fourteen categories this bump added (321
 * through 334) contribute all 35, and the pre-existing categories still
 * contribute exactly 254, document for document. No document that used to be
 * written back faithfully stopped being.
 *
 * 289 -> 290 with the spec bump to carve 8b80822, attributed the same way
 * before it was raised. The enveloped list was dumped under both pins and
 * diffed by name: exactly ONE name is added and NONE is removed, so the
 * pre-existing corpus still contributes exactly 289, document for document.
 *
 * The one addition is `337-a-comment-fence-opened-on-an-item-s-marker-line-
 * hides-its-body-too`, one of the seven documents markup-carve/carve#1311 added.
 * Its fence opens on the item's MARKER line:
 *
 *     - %%%
 *       [r]: /url
 *       %%%
 *
 * The projection has no slot for a block that starts on a marker line, so the
 * document keeps its source and the first edit is what starts writing the
 * projection. The other six of the seven are written back faithfully.
 *
 * 290 -> 336 with the spec bump to carve 287b4b8, attributed the same way
 * before it was raised. The enveloped list was dumped under both pins and
 * diffed by SLUG: 46 names are added and NONE is removed, so the pre-existing
 * corpus still contributes exactly 290, document for document.
 *
 * Of the 46, thirty-nine come from the seventeen categories the bump adds. The
 * remaining seven all sit in one PRE-EXISTING category,
 * `a-column-0-line-after-a-container-s-last-block-when-that-block-left-no-
 * paragraph-open` - which is why the split had to be checked rather than
 * assumed from the category list. That category grew from 13 files to 29, and
 * all seven are among the sixteen NEW variants (-14, -15, -16, -17, -19, -23,
 * -29). Not one document that used to be written back faithfully stopped being.
 *
 * The pin then moved again to 0490ae5, which adds category 359 and two more
 * documents. The count does NOT move: both are written back faithfully, so
 * 336 covers 1241 documents rather than 1239.
 *
 * 336 -> 337 with the spec bump to carve 0f6b990. That bump is purely
 * additive - it adds category 360 and its four documents and touches no
 * existing corpus file - so the pre-existing 1241 still contribute exactly
 * 336 by construction, and the split is between the four new documents alone.
 * Three of them are written back faithfully. The one addition is
 * `360-a-definition-behind-an-alternating-container-prefix-registers-at-the-
 * innermost-content-column-3`, the variant whose innermost block is a heading:
 *
 *     - > - - x
 *       >     # h
 *
 * The projection does not model a prefix that alternates list and quote, so
 * writing it back respells the markers and opens a blank quote line between
 * the item text and the heading, which moves the heading out of the item it
 * was written into. The document therefore keeps its source. The sibling
 * variants, whose innermost block is a link reference definition or a footnote
 * definition, survive because the definition leaves the flow entirely.
 *
 * 337 -> 329 when the `@markup-carve/carve` pin moved 83 commits onto carve-js
 * main (2dc3232e). Reported in BOTH directions, because the net is a lie here:
 * 18 documents came IN and 26 went OUT, so 44 moved under a headline of -8.
 * The corpus did not change in this bump, so every mover is the engine.
 *
 * Which was checked rather than assumed. The enveloped list was dumped under
 * both pins and diffed by name, then each of the movers was re-rendered under
 * both engines: 50 of the 51 documents that move either ratchet are documents
 * the new engine READS DIFFERENTLY. Not one moved because the serializer
 * changed, because it did not.
 *
 * The 26 leaving are the point of the bump. Twenty-three of them are the
 * container-content-column family the engines fixed for this release
 * (markup-carve/carve#1364 and siblings): ten in `326-a-column-0-line-after-a-
 * container-s-last-block-when-that-block-left-no-paragraph-open`, three each in
 * `349`, `350` and `357`, two each in `333` and `355`, one each in `327` and
 * `329`. `- | a | b |` over a column-0 `tail` used to put the tail INSIDE the
 * item; it is a sibling paragraph now, which is a shape the projection writes
 * back faithfully. The editable projection got better because the engine
 * started parsing those documents correctly.
 *
 * The 18 arriving are four clusters plus four singles:
 *
 * - `322-an-attribute-block-reaches-the-nested-list-it-precedes` (5) and
 *   `319-cell-attributes-bind-after-the-kind-and-alignment-markers` (4) are the
 *   same shape, and neither is a ruling from this cycle. The old engine did not
 *   implement either construct, so both sides agreed by mutual ignorance: on
 *   `|={.total} Total |= 99 |` it read `{.total}` as cell TEXT, and on an
 *   indented `{.x}` above a nested list it dropped the run. The new engine
 *   binds both. The serializer then writes each in the WRONG PLACE - the cell
 *   run before the markers as `|{.total}=` instead of after them, and the list
 *   run at column 0 instead of at the item's content column, which detaches the
 *   nested list from its item. Those are pre-existing serializer defects that
 *   only became observable once the attribute existed to misplace. Both keep
 *   their source, so they are protected fallbacks rather than silent losses.
 * - `348-a-closed-inline-construct-spanning-a-verse-boundary` (3) and
 *   `353-a-bracketed-construct-spanning-a-verse-boundary` (2) ARE rulings from
 *   this release, so their arrival is expected: the engine started modelling a
 *   construct the projection has no rich slot for yet.
 * - Two are `326` moving the other way (`-7` and `-8`). Same fix, opposite
 *   effect: `- [r]: /u` over a column-0 `tail` leaves the item EMPTY and lifts
 *   the tail out, and an empty item followed by a sibling paragraph is a shape
 *   the projection does not write back. That is why the split inside `326` had
 *   to be measured rather than read off the category name.
 * - `323-...-leaves-the-item-tight` and `344-a-comment-only-line-in-a-line-
 *   block-is-removed-before-any-inline-run` contribute one each, and `344-3`
 *   leaves at the same time. An unclosed code span in a line block now reaches
 *   the end of the block and swallows the comment line, so the two variants
 *   swap places for the same reason.
 *
 * 329 -> 341 with the spec bump to carve 22f7f47, which takes the corpus from
 * 1245 documents to 1259. Both directions: 12 in and ZERO out. The bump is
 * purely additive - five categories appended at file end, nothing renumbered
 * and no existing corpus file touched, checked with a name diff and a stat over
 * the submodule range - so the pre-existing 1245 still contribute exactly 329.
 * That was verified rather than left to construction: both lists were dumped
 * under both submodule commits and compared by SOURCE TEXT, and of the 1234
 * distinct sources present under both, ZERO flipped in either direction.
 *
 * Twelve of the fourteen new documents, not fourteen. The count was measured
 * one document at a time, because the last bump moved this ratchet by ONE for
 * four new documents and extrapolating from the document count would have been
 * wrong in both directions. The two that need no envelope are
 * `363-a-task-item-s-checkbox-is-not-decided-by-its-first-block`, whose blocks
 * are ordinary item content, and
 * `364-only-lazy-folding-demotes-a-marker-line-colon-opener-2`, the variant
 * whose colon opener a lazy line demotes to text, so there is no container left
 * to lose.
 *
 * Marker-line blocks now stay on the marker line, reducing the pinned envelope
 * population from 341 to 296. The six categories added by carve c5e874d add
 * seventeen documents; seven need the envelope, taking the population to 303.
 * The next spec pin adds four collected-definition variants that all require
 * the envelope, while inherited table alignment round-trips structurally: 307.
 * Keep the exact count so a serializer change must account for both newly
 * faithful and newly lossy documents.
 *
 * The bump to bfec478 adds fourteen categories and 43 documents, of which 30
 * need the envelope: 307 -> 337. Measured per category, not extrapolated, in
 * the order the corpus lists them:
 *
 *     376 head-and-foot-row-counts              1 of 1
 *     377 unclosed-inline-literal               3 of 3
 *     378 terminal-comment-in-a-quote           0 of 2
 *     379 reference-definition-destination      3 of 3
 *     380 terminal-comment-line-verse           1 of 1
 *     381 resumed-lazy-run                      8 of 8
 *     382 marker-line-link-definition           2 of 2
 *     383 lazy-marker-line-s-definition         4 of 5
 *     384 continuation-marker-flush-left        4 of 6
 *     385 hyphen-run-flag                       0 of 2
 *     386 doubled-run-canonical-arrow           0 of 1
 *     387 braced-hyphen-en-dash                 0 of 2
 *     388 empty-brace-pair                      1 of 2
 *     389 boolean-attribute-underscore          3 of 4
 *
 * The four categories at zero are all INLINE rulings, which is the pattern -
 * an inline construct leaves the block projection intact, so nothing forces
 * the envelope. The ones at full count are definition and marker-line
 * collection, which the structured tree still cannot hold.
 *
 * No existing document flipped: the new categories account for exactly 30 and
 * the total moved by exactly 30. The three existing documents whose SOURCE the
 * bump changed were re-measured directly - `20-smart-typography-arrows-and-
 * symbols` and `68-nested-containers` need no envelope, and
 * `88-list-continuation-marker` needs 4 of 6, the count it already had.
 *
 * The bump to e88d6e3 adds ten categories and 26 documents, of which FOUR need
 * the envelope: 337 -> 341. Measured per category the same way:
 *
 *     390 table-cell-marker-run-ends-at-a-space   1 of 5
 *     391 attribute-line-below-a-list-item        1 of 2
 *     392 attributed-cell-keeps-its-marker        0 of 2
 *     393 engine-written-shape-says-its-name      0 of 7
 *     394 leading-escaped-caret-keeps-its-escape  1 of 1
 *     395 longer-run-at-a-list-boundary           0 of 1
 *     396 idle-escape-does-not-spread             1 of 1
 *     397 null-byte-replaced-before-the-read      0 of 3
 *     398 container-s-span-ends-at-last-child     0 of 2
 *     399 definition-list-ends-there-too          0 of 2
 *
 * The pattern is the ESCAPE SPELLING, not the construct. Two of the four are
 * escapes the structured tree does not hold - `\^ not a caption` under an image
 * and the escaped opener of an indented `## H` - and the third is `|\= a |`,
 * the same thing inside a table cell. The fourth is an attribute line under a
 * list item. The six categories at zero are the ones whose ruling is about
 * block EXTENT or about a character the parser replaces, neither of which
 * disturbs the projection.
 *
 * No existing document flipped here either. The seven documents whose SOURCE
 * this bump changed - the `319`, `354` and `355` respellings that carve#1460's
 * "a marker run ends at a space" forced - were re-measured directly and need no
 * envelope, which is the count they already had; the new categories account for
 * exactly 4 and the total moved by exactly 4.
 *
 * 341 -> 342 with the spec bump to carve d0b6c92, attributed the same way
 * before it was raised. The enveloped list was dumped under both pins
 * (e88d6e3 and d0b6c92) and diffed by name: exactly ONE name is added and NONE
 * is removed, so the pre-existing corpus still contributes exactly 341,
 * document for document.
 *
 * The one addition is `403-an-idle-escape-does-not-spread-from-the-occurrence-
 * that-needed-one`, and it is the projection being RIGHT rather than worse.
 * The document is two lines indented by one space:
 *
 *      {.note}
 *      This paragraph.
 *
 * At that indent `{.note}` is paragraph TEXT, and the engine renders
 * `<p>{.note}` accordingly. The projection holds a paragraph and nothing else,
 * so writing it back puts both lines at column 0 - where `{.note}` IS an
 * attribute block and the document parses to something else entirely. Measured
 * rather than reasoned: the projection alone writes `{.note}\nThis paragraph.`,
 * whose AST differs from the source's. So the loader keeps the source, and the
 * envelope is the only thing standing between this document and a silent
 * reinterpretation. An enveloped document is still stored losslessly; this one
 * is enveloped because the indent is load-bearing and the projection has no
 * slot for it.
 *
 * The other six categories the bump added need no envelope: 12 files across 7
 * categories were run one at a time through the source-aware loader, all 12
 * convert without the whole-document fallback atom and all 12 reparse to the
 * same AST.
 *
 * 342 IS MEASURED AGAINST THE RELEASED ENGINE, and the released engine is 120
 * commits behind carve-js main. This number therefore moves when carve-js
 * publishes next, and it was measured ahead of time rather than left to be
 * discovered as a red tick during a release: built from carve-js main, dropped
 * into node_modules in place of 0.1.4, and the enveloped list dumped under both
 * and diffed BY NAME.
 *
 * 342 -> 344, and the net of 2 hides the size of it: ELEVEN names are added and
 * NINE are removed. The nine removals are the projection getting better and
 * need no defence. The eleven additions are one ruling, not eleven:
 * `05-lists-23`, `05-lists-25`, `05-lists-26`, `05-lists-27`, `05-lists-28` and
 * `395-a-longer-run-at-a-list-boundary-is-written-as-exactly-three-blank-lines`
 * are the six documents carrying a run of four or more blank lines at a list
 * boundary, which the writer now collapses to exactly three - so their source
 * no longer survives the projection and the envelope is what keeps it. The
 * other five (`369` twice, `371`, `373`, `375`) are the quote-marker and
 * table-alignment rulings landing the same way.
 *
 * So when the engine moves, the number moves to 344 and every one of the eleven
 * has a ruling behind it. What must NOT happen is the assertion being relaxed
 * to whatever the run reports: the count is a claim about which documents the
 * projection can carry losslessly, and a count that follows the engine asserts
 * nothing at all.
 *
 * 342 -> 348 with the spec bump to carve f7cf0b3, attributed the same way
 * before it was raised. The enveloped list was dumped under BOTH pins and
 * diffed by name: six names are added, NONE is removed, and no pre-existing
 * document changed its round-trip verdict either - so the 1370 documents that
 * were already here still contribute exactly 342, document for document.
 *
 * That bump is purely additive: fourteen documents, no corpus file modified or
 * deleted. Eleven of the fourteen are the four new categories `407` through
 * `410`, and three extend the existing `362`. Six of the fourteen need the
 * envelope: both files of `407`, `409-2`, `409-3`, `410-4`, and `362-5`.
 *
 * All six are the same shape, which is the shape the new categories exist to
 * pin - WHICH blank line inside an item a construct consumed, and therefore
 * whether the list is loose:
 *
 *     - a
 *
 *       b
 *
 * The projection stores the item's blocks, not the record of who consumed a
 * blank run, so writing the item back respells the run and the distinction the
 * document exists to record is not write-identical. The source therefore rides
 * along and the first edit is what starts writing the projection. The eight
 * that need no envelope are the variants whose blank run falls outside an item
 * or is not load-bearing.
 *
 * 348 -> 331 when a VALUE-LESS attribute started coming back as its bare name
 * (markup-carve/carve-grammars#344). Attributed before it was lowered, and the
 * direction matters: the enveloped list was dumped under both trees and diffed
 * by name, and SEVENTEEN names left while ZERO entered. Every one of the
 * seventeen is a document whose attribute run holds a name with no value, which
 * is the one thing the fix changed:
 *
 * - the boolean-attribute categories themselves - `97-boolean-attributes` and
 *   `-2`, `389-a-boolean-attribute-does-not-start-with-an-underscore` and `-3`
 *   / `-4`, and `292-a-boolean-and-a-key-value-of-the-same-name-are-one-
 *   attribute`;
 * - the SEMANTIC ELEMENT NAME, which is authored value-less, so `[Ctrl+C]{kbd}`
 *   came back `[Ctrl+C]{}` and the element degraded to a plain span:
 *   `45-inline-extensions-2` / `-8` / `-9` / `-10`, `71-attribute-edge-cases-11`,
 *   `293-a-semantic-name-renames-the-span-...-3` / `-4` and `299-...-3`;
 * - `297-the-language-sigil-takes-no-padding`, where `[x]{: fr}` leaves a
 *   boolean behind;
 * - `407-one-consumed-boolean-spells-the-looseness-no-blank-line-can` and `-2`,
 *   the category this fix exists for: `{loose}` is the only spelling PART 9
 *   section 17 L7 leaves where no blank line can carry the looseness.
 *
 * The first two groups were already named as known losses in
 * tests/mounted-roundtrip-test.js, one release before the ticket that made
 * fixing them urgent - `{loose}` is the same defect on a construct where
 * losing it changes what the document MEANS rather than how it is styled.
 *
 * 331 -> 332 with the spec bump to carve be6e7cc, attributed the same way
 * before it was raised. The enveloped list was dumped under both pins and
 * diffed by name: exactly ONE name is added and NONE is removed, so the
 * pre-existing corpus still contributes exactly 331, document for document.
 *
 * The one addition is `411-a-lone-indented-image-is-a-paragraph-and-its-html-
 * cannot-say-so`, the first of the two documents markup-carve/carve#1663 added.
 * Its source is one line carrying ONE leading space:
 *
 *      ![Apollo](a.jpg)
 *
 * The projection is right - a paragraph holding an image - but a paragraph has
 * nowhere to keep the leading space, so the writer respells the line at column 0
 * and the source rides along. The reference-image variant `-2` needs no
 * envelope: its leading space is dropped and it reparses to the same AST.
 */
assert.strictEqual(
    envelopedFiles.length, 332,
    `${envelopedFiles.length} corpus documents need the source envelope, not 332`,
);

assert.strictEqual(
    wholeDocumentFallbackCategories.size, 0,
    'covered categories that need the whole-document source envelope: '
    + [...wholeDocumentFallbackCategories].sort().join(', '),
);

{
    // A heading reference has no external definition. Its source-sensitive
    // label can stay local to the heading/paragraph shells instead of forcing
    // the complete document into one opaque fallback atom.
    const source = '# a\\_b heading\n\n[a\\_b heading][]\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.notStrictEqual(pm.content?.[0]?.type, 'carveUnsupported');
    assert.deepStrictEqual(normalizeAst(parse(serializeToCarve(pm))), normalizeAst(parse(source)));
}

{
    // Definition attributes are merged into resolved links by the AST, while
    // rawRef carries only attributes authored on this use. Keep both source
    // locations distinct so neither attribute run is duplicated or reordered.
    const source = '[Example][ex]{.internal #b}\n\n[ex]: /u {.external #a}\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.notStrictEqual(pm.content?.[0]?.type, 'carveUnsupported');
    assert.deepStrictEqual(normalizeAst(parse(serializeToCarve(pm))), normalizeAst(parse(source)));
}

{
    const source = '```=html\n<div data-x="1">raw</div>\n```\n\nKept\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    const carve2 = serializeToCarve(pm);
    assert.deepStrictEqual(normalizeAst(parse(carve2)), normalizeAst(parse(source)));
}

{
    const source = '{data-x=1}\nParagraph\n';
    const pm = carveToProseMirror(source);
    const carve2 = serializeToCarve(pm);
    assert.deepStrictEqual(normalizeAst(parse(carve2)), normalizeAst(parse(source)));
}

{
    // Safe documents retain rich, editable ProseMirror nodes.
    const pm = carveToProseMirror('# Heading\n', { unsupported: 'preserve' });
    assert.strictEqual(pm.content[0].type, 'heading');
}

{
    // A mapped-but-source-sensitive document keeps its structured nodes and an
    // edit-aware source envelope, including whitespace canonical serialization
    // would otherwise discard.
    const source = '   # literal heading\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.strictEqual(pm.content[0].type, 'paragraph');
    assert.strictEqual(pm.attrs.carveSource, source);
    assert.deepStrictEqual(JSON.parse(pm.attrs.carveSourceLayout), {
        version: 1,
        encoding: 'utf-8',
        source,
        lineEndings: 'lf',
        bom: false,
        nodes: JSON.parse(pm.attrs.carveSourceLayout).nodes,
    });
    assert.strictEqual(serializeToCarve(pm), source);

    // Editing the structured tree invalidates the fingerprint, so stale source
    // is never allowed to overwrite the user's change.
    pm.content[0].content[0].text = 'edited heading';
    assert.notStrictEqual(serializeToCarve(pm), source);
    assert.strictEqual(serializeToCarve(pm), 'edited heading');
}

{
    // A leading table span marker has no origin to merge into, but remains an
    // editable table cell rather than making the table/document opaque.
    const source = '| < | b |\n|---|---|\n| c | d |\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.strictEqual(pm.content[0].type, 'table');
    assert.strictEqual(pm.content[0].content[0].content[0].attrs.carveSpanMarker, '<');
    assert.deepStrictEqual(normalizeAst(parse(serializeToCarve(pm))), normalizeAst(parse(source)));
}

{
    // Unsupported inline content is isolated to its own source atom; its
    // containing heading and sibling blocks remain editable.
    const source = '# Editable\n\n## Smart -- heading\n\nStill editable\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.deepStrictEqual(pm.content.map((node) => node.type), [
        'heading', 'heading', 'paragraph',
    ]);
    assert.strictEqual(pm.content[1].content[1].type, 'carveUnsupportedInline');
    assert.deepStrictEqual(
        normalizeAst(parse(serializeToCarve(pm))),
        normalizeAst(parse(source)),
    );
}

{
    // Frontmatter is a NODE, not an opaque prefix: the block is carried
    // verbatim - PART 12 section 7 keeps it unparsed - in a carveFrontmatter
    // atom the editor can show and the serializer rebuilds the fences around.
    const source = '--- yaml\ntitle: T\n---\n\n# Editable\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.deepStrictEqual(pm.content.map((node) => node.type), [
        'carveFrontmatter', 'heading',
    ]);
    assert.deepStrictEqual(pm.content[0].attrs, { format: 'yaml', content: 'title: T' });
    assert.deepStrictEqual(
        normalizeAst(parse(serializeToCarve(pm))),
        normalizeAst(parse(source)),
    );
}

{
    // A malformed fence boundary can leave an empty inline code leaf in the
    // engine AST. ProseMirror rejects empty text nodes, so the bridge must omit
    // that zero-width leaf instead of handing Tiptap invalid JSON.
    const pm = carveToProseMirror('- ```\n x\n ```\n', { unsupported: 'preserve' });
    const emptyText = [];
    const visit = (node, path = '') => {
        if (node?.type === 'text' && node.text === '') emptyText.push(path);
        (node?.content || []).forEach((child, index) => visit(child, `${path}/content/${index}`));
    };
    visit(pm);
    assert.deepStrictEqual(emptyText, []);
}

console.log('\nround-trip OK');
