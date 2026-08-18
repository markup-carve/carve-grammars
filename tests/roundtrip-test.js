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
 */
assert.strictEqual(
    envelopedFiles.length, 329,
    `${envelopedFiles.length} corpus documents need the source envelope, not 329`,
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
