/**
 * Coverage-matrix test (#4).
 *
 * Asserts that, for each grammar, the COVERAGE matrix partitions the live corpus
 * category list exactly: every category is either covered or skipped (with a
 * reason), and none is both. When a new spec category lands in the submodule,
 * this test fails until someone makes a deliberate covered-or-skip decision for
 * each grammar, so new syntax can never silently escape conformance.
 */
import assert from 'node:assert';
import { listCategories } from './lib/corpus.js';
import { COVERAGE, assertPartition, isCovered, skipReason, slugOf } from './lib/coverage.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('carve-grammars coverage matrix:');

const categories = listCategories();
console.log(`  (${categories.length} corpus categories)`);

for (const grammar of Object.keys(COVERAGE)) {
    ok(`${grammar}: covered + skip partition every category`, () => {
        const { unclassified, overlap } = assertPartition(grammar, categories);
        assert.strictEqual(
            unclassified.length, 0,
            `unclassified categories for "${grammar}" (add each to covered or skip with a reason):\n` +
            unclassified.map((c) => `    - ${c}`).join('\n'),
        );
        assert.strictEqual(
            overlap.length, 0,
            `categories in BOTH covered and skip for "${grammar}":\n` +
            overlap.map((c) => `    - ${c}`).join('\n'),
        );
    });
}

ok('tiptap: every skip has a non-empty reason', () => {
    for (const [cat, reason] of COVERAGE.tiptap.skip) {
        assert.ok(reason && reason.trim().length > 0, `tiptap skip "${cat}" needs a reason`);
    }
});

ok('the matrix answers by slug, so renumbering the corpus changes nothing', () => {
    // The numeric prefix is a POSITION in the spec's document order, so one
    // inserted example renumbers everything after it. Every consumer of this
    // matrix has to match on the slug; the round-trip test did not, and a bump
    // silently reclassified all 37 covered categories as skipped - which does
    // not fail, it only stops asserting. Covered files checked went 55 -> 22.
    for (const grammar of ['prism', 'highlightjs', 'tiptap']) {
        for (const category of listCategories()) {
            const renumbered = `999-${slugOf(category)}`;
            assert.strictEqual(
                isCovered(grammar, renumbered),
                isCovered(grammar, category),
                `${grammar}: "${category}" changed classification when renumbered`,
            );
            assert.strictEqual(
                skipReason(grammar, renumbered),
                skipReason(grammar, category),
                `${grammar}: "${category}" lost its skip reason when renumbered`,
            );
        }
    }
});

console.log(`\n${passed} passed`);
