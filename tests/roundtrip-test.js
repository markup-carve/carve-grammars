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
import { COVERAGE, isCovered, skipReason } from './lib/coverage.js';

console.log('carve-grammars serializer round-trip:');

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

if (skipShouldPromote.length) {
    console.log('\nThe following SKIPPED categories now round-trip cleanly for every file.');
    console.log('Promote them to tiptap.covered (and drop the skip reason):');
    for (const c of skipShouldPromote) console.log(`    - ${c}`);
    failures++;
}

assert.strictEqual(failures, 0, `${failures} round-trip check group(s) failed (see above)`);

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
    // A mapped-but-lossy source falls back as a whole document, including
    // leading/trailing whitespace that the normal serializer canonicalizes.
    const source = '   # literal heading\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.strictEqual(pm.content.length, 1);
    assert.strictEqual(pm.content[0].type, 'carveUnsupported');
    assert.strictEqual(serializeToCarve(pm), source);
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
    // Frontmatter is source-local: metadata remains opaque, while body blocks
    // stay editable instead of the complete document becoming one atom.
    const source = '--- yaml\ntitle: T\n---\n\n# Editable\n';
    const pm = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.deepStrictEqual(pm.content.map((node) => node.type), [
        'carveUnsupported', 'heading',
    ]);
    assert.deepStrictEqual(
        normalizeAst(parse(serializeToCarve(pm))),
        normalizeAst(parse(source)),
    );
}

console.log('\nround-trip OK');
