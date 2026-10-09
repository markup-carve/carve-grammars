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

// The pages spec/tests/corpus is generated from. Each `carve` fence inside a
// `::: compare` block is one corpus pair; a block may hold several.
const EXAMPLE_PAGES = ['core.md', 'extensions.md', 'edge-cases.md'];
const EXAMPLES_DIR = fileURLToPath(new URL('../../spec/resources/examples', import.meta.url));

const leadingRun = (s, ch) => {
    let n = 0;
    while (n < s.length && s[n] === ch) n++;
    return n;
};

/**
 * Count the corpus pairs one example page declares, mirroring the spec's
 * scripts/lib/example-pair-census.mjs: nothing inside a fence is markup.
 * @param {string} text
 * @returns {number}
 */
export function declaredPairsIn(text) {
    let pairs = 0;
    let marker = null;
    let fence = null;
    for (const line of text.split('\n')) {
        if (fence !== null) {
            if (line.startsWith(fence) && line.slice(fence.length).trim() === '') fence = null;
            continue;
        }
        const ticks = leadingRun(line, '`');
        if (ticks >= 3) {
            fence = line.slice(0, ticks);
            if (marker !== null && line.slice(ticks).trim() === 'carve') pairs += 1;
            continue;
        }
        const trimmed = line.trim();
        const colons = leadingRun(trimmed, ':');
        if (colons < 3) continue;
        if (marker === null) {
            if (/^[ \t]+compare(?:[ \t]|$)/.test(trimmed.slice(colons))) marker = trimmed.slice(0, colons);
        } else if (trimmed === marker) {
            marker = null;
        }
    }
    return pairs;
}

/**
 * How many corpus documents the pinned spec DECLARES.
 * @returns {number}
 */
export function declaredCorpusSize() {
    let declared = 0;
    for (const page of EXAMPLE_PAGES) {
        let text;
        try {
            text = readFileSync(`${EXAMPLES_DIR}/${page}`, 'utf8');
        } catch {
            throw new Error(
                `${EXAMPLES_DIR}/${page} is missing - the submodule is incomplete, or the ` +
                'spec moved the corpus source pages. Without them there is nothing to ' +
                'check the corpus size against.',
            );
        }
        declared += declaredPairsIn(text);
    }
    return declared;
}

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
    // An EMPTY corpus was the only population this loader refused. Everything
    // between empty and whole passed: a half-fetched submodule, an interrupted
    // checkout or a document deleted by hand left every suite in this package
    // green over a smaller corpus than the one it reports on. The snapshot
    // goldens now catch a REMOVED document, but only for documents that already
    // had a golden - nothing checked the population itself.
    //
    // The expectation is DERIVED rather than written down, so it moves with the
    // submodule and cannot go stale: spec/tests/corpus is generated from the
    // `carve` fences in the `::: compare` blocks of spec/resources/examples/
    // {core,extensions,edge-cases}.md, so counting them says how many documents
    // the pin declares. A literal here would be one more number to forget on a bump,
    // and a floor cannot tell a whole corpus from a truncated one - which is
    // the only question worth asking.
    const declared = declaredCorpusSize();
    if (crvFiles.length !== declared) {
        throw new Error(
            `The spec pin declares ${declared} corpus document(s) but ` +
            `${CORPUS_DIR} holds ${crvFiles.length}. ` +
            'A run over a corpus nobody chose is not a pass, it is a smaller ' +
            'question answered. Run `git submodule update --init` to complete ' +
            'the checkout.',
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
