/**
 * Shared-corpus loader.
 *
 * The corpus lives in the `markup-carve/carve` spec repo, vendored here as the
 * `spec/` git submodule. Every conformance test (snapshots, round-trip,
 * coverage) drives off the same `.crv` inputs so the three grammars are held to
 * one source of truth.
 *
 * A "category" is the `NN-name` prefix shared by a base file and its numbered
 * variants: `01-emphasis.crv`, `01-emphasis-2.crv`, `01-emphasis-10.crv` all
 * belong to category `01-emphasis`. The trailing `-N` (if any) is the variant
 * index, not part of the category name.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CORPUS_DIR = fileURLToPath(new URL('../../spec/tests/corpus', import.meta.url));

// `01-emphasis-10.crv` -> group 1 = `01-emphasis`. The lazy `*?` plus the
// optional `(-\d+)?` suffix means a trailing `-<digits>` is peeled off as the
// variant index, while digits that are part of the name (none currently, but
// e.g. a hypothetical `99-utf8-edge`) stay put because they are not a pure
// trailing numeric run.
const CATEGORY_RE = /^(\d+-[a-z][a-z0-9-]*?)(-\d+)?\.crv$/;

const byNatural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/**
 * @returns {{name: string, category: string, path: string, source: string}[]}
 */
export function listCorpusFiles() {
    let entries;
    try {
        entries = readdirSync(CORPUS_DIR);
    } catch {
        entries = [];
    }
    const crvFiles = entries.filter((f) => f.endsWith('.crv'));
    if (crvFiles.length === 0) {
        throw new Error(
            `No .crv corpus files found in ${CORPUS_DIR}. ` +
            'The carve spec submodule is probably not initialized; run ' +
            '`git submodule update --init` and retry.',
        );
    }

    return crvFiles
        .map((file) => {
            const m = file.match(CATEGORY_RE);
            if (!m) {
                throw new Error(`Corpus file does not match the NN-name pattern: ${file}`);
            }
            return {
                name: file.replace(/\.crv$/, ''),
                category: m[1],
                path: `${CORPUS_DIR}/${file}`,
                source: readFileSync(`${CORPUS_DIR}/${file}`, 'utf8'),
            };
        })
        .sort((a, b) => byNatural(a.name, b.name));
}

/**
 * @returns {string[]} sorted, unique category names (numeric-aware order).
 */
export function listCategories() {
    const set = new Set(listCorpusFiles().map((f) => f.category));
    return [...set].sort(byNatural);
}
