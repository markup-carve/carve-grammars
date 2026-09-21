/**
 * A population ledger: the exact SET of corpus documents in a measured class,
 * not how many there are.
 *
 * A count catches a net worsening and nothing else. Swapping one document for
 * another leaves the count alone, so a construct that started needing the
 * source envelope hides behind one that stopped (markup-carve/carve-grammars#514).
 * carve-wasm pins the equivalent populations as sets for the same reason.
 *
 * Entries are SLUGS. The corpus is generated from the spec's example pages in
 * document order, so a numeric prefix is a position: inserting one example
 * upstream renumbers everything after it, and a ledger keyed by filename would
 * then report the whole tail as moved. The goldens and the coverage matrix are
 * keyed the same way.
 *
 * Regenerate with `UPDATE_LEDGERS=1 node tests/<the test>.js`, then read the
 * diff: an added entry is a document that started needing the fallback, a
 * removed one is a reason that has to be retired from the file's accounting.
 *
 * @module tests/lib/ledger
 */
import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UPDATE = process.env.UPDATE_LEDGERS === '1';

/**
 * Compare a measured population against its recorded ledger.
 *
 * @param {string} file - Ledger filename inside `tests/`.
 * @param {string[]} measured - Slugs measured on this run.
 * @param {string} what - What the population is, for the failure message.
 */
export function assertLedger(file, measured, what) {
    const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
    const now = [...measured].sort();

    const duplicates = now.filter((slug, index) => index > 0 && slug === now[index - 1]);
    assert.deepStrictEqual(
        duplicates, [],
        `two corpus documents share a slug, so the ledger cannot name them apart: ${duplicates.join(', ')}`,
    );

    if (UPDATE) {
        writeFileSync(path, `${JSON.stringify(now, null, 2)}\n`);
        console.log(`  (wrote ${now.length} entries to tests/${file})`);

        return;
    }

    const recorded = JSON.parse(readFileSync(path, 'utf8'));
    const recordedSet = new Set(recorded);
    const nowSet = new Set(now);
    const added = now.filter((slug) => !recordedSet.has(slug));
    const gone = recorded.filter((slug) => !nowSet.has(slug));

    assert.deepStrictEqual(
        { added, gone }, { added: [], gone: [] },
        `${what} moved (${recorded.length} recorded, ${now.length} measured).\n`
        + `  started needing it: ${added.join(', ') || 'none'}\n`
        + `  stopped needing it: ${gone.join(', ') || 'none'}\n`
        + `  Attribute each one, then refresh with UPDATE_LEDGERS=1.`,
    );
}

export default assertLedger;
