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
import { COVERAGE, assertPartition } from './lib/coverage.js';

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

console.log(`\n${passed} passed`);
