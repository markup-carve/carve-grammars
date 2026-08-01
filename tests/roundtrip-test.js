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
import { COVERAGE } from './lib/coverage.js';

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
    try {
        const pm = astToProseMirror(astA);
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
    return { ok: true };
}

let failures = 0;
let coveredFilesChecked = 0;
const skipShouldPromote = [];

for (const category of listCategories()) {
    const files = filesByCategory.get(category) || [];
    const isCovered = COVERAGE.tiptap.covered.has(category);

    if (isCovered) {
        const bad = [];
        for (const f of files) {
            const r = roundTrip(f);
            coveredFilesChecked++;
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
        const reason = COVERAGE.tiptap.skip.get(category) || '(no reason)';
        console.log(`  - SKIP ${category}: ${reason}`);
    }
}

console.log('');
console.log(`  covered files checked: ${coveredFilesChecked}`);
console.log(`  covered categories: ${COVERAGE.tiptap.covered.size}, skipped: ${COVERAGE.tiptap.skip.size}`);

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

console.log('\nround-trip OK');
