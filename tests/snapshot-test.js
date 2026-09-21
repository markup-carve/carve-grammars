/**
 * Golden token snapshots for the Prism and highlight.js grammars (#3).
 *
 * For every corpus file in a grammar's covered set we run the library's own
 * tokenizer over the source and snapshot the resulting token stream (token
 * scope/type + the exact text it spans) as a golden JSON file. A change in
 * either grammar that shifts how a construct tokenizes shows up as a snapshot
 * diff, which is the point: the snapshot is the regression net.
 *
 * Token representations (kept deliberately simple and stable):
 *
 * - Prism: the token tree is flattened to a list of leaf `{type, text}` entries.
 *   A nested token contributes its parent types as a `>`-joined path, e.g. a
 *   bare string inside a `title` token becomes `{type: "title", text: "..."}`
 *   and an `italic` nested in `title` becomes `{type: "title>italic", ...}`.
 *   Plain (untyped) string runs use `type: "text"`.
 * - highlight.js: the emitted HTML is scanned into a list of `{scope, text}`
 *   entries, where `scope` is the innermost `hljs-*` class (without the `hljs-`
 *   prefix) covering that text, or `null` for unscoped text. HTML entities are
 *   unescaped back to raw characters so the snapshot shows real text.
 *
 * Goldens are written only with UPDATE_SNAPSHOTS=1 (the `snapshots:update`
 * script); otherwise the live output is compared against the committed golden.
 * A MISSING golden in compare mode is a FAILURE, not a silent bootstrap: that is
 * what forces a deliberate decision when a new spec category (and therefore new
 * corpus files) appears for the prism/highlightjs grammars, mirroring the
 * coverage-matrix gate that protects the tiptap grammar.
 */
import assert from 'node:assert';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listCorpusFiles } from './lib/corpus.js';
import { coveredCategories, slugOf } from './lib/coverage.js';
import { prismTokens as prismLeafScopes, hljsTokens as hljsLeafScopes } from './lib/engines.js';

const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const SNAP_DIR = fileURLToPath(new URL('./snapshots', import.meta.url));

let passed = 0;
let written = 0;
let failures = 0;
let compared = 0;

console.log('carve-grammars highlight snapshots:');

/*
 * THE GOLDEN RECORDS EVERY CLASS THE READER SEES.
 *
 * Both engines are read through tests/lib/engines.js, which this file used to
 * shadow with narrower copies of the same two flatteners. The copies dropped
 * exactly the part a reader sees:
 *
 * - Prism renders `type` AND `alias` as CSS classes, and the local flattener
 *   recorded only `type`. Changing the `italic` rule's alias to `bold`, so
 *   every `/run/` is highlighted as bold, moved none of the 3480 goldens
 *   (markup-carve/carve-grammars#512).
 * - highlight.js nests its spans, and the local scanner kept only the
 *   innermost, so an outer scope could change unseen on the documents that
 *   nest.
 *
 * The recorded key names stay `type` and `scope`, so this is a change of
 * VALUE: a golden moves only where the run carried something the old shape
 * could not say.
 */
const prismTokens = (source) =>
    prismLeafScopes(source).map(({ scope, text }) => ({ type: scope ?? 'text', text }));

const hljsTokens = (source) =>
    hljsLeafScopes(source).map(({ ancestors, text }) => ({ scope: ancestors.join('>') || null, text }));

/**
 * Compare against (or bootstrap) a golden snapshot file.
 *
 * The golden is keyed by SLUG, not by the corpus filename. The corpus is
 * generated from docs/examples in document order, so its numbers are positions:
 * inserting one example upstream renumbers every file after it, and goldens
 * keyed by filename then all appear to change at once. Bumping the submodule
 * across the 33 commits it sat behind reported 562 differing snapshots, none of
 * which were token changes.
 *
 * That number is the problem. 562 is not a reviewable diff, so the realistic
 * outcome is a regenerate-and-merge without reading - and a genuine tokenizer
 * regression rides along unnoticed. Keyed by slug, a renumber touches nothing
 * and a real token change is a diff of the files that actually changed (#74).
 */
function snapshot(grammar, name, tokens) {
    compared++;
    const dir = `${SNAP_DIR}/${grammar}`;
    const file = `${dir}/${slugOf(name)}.json`;
    const serialized = JSON.stringify(tokens, null, 2) + '\n';

    if (UPDATE) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, serialized);
        written++;
        return;
    }

    if (!existsSync(file)) {
        failures++;
        console.log(`  ✗ ${grammar}/${slugOf(name)} has no golden snapshot (corpus file ${name})`);
        console.log(`      a new corpus file (likely a new spec category) is uncovered for ${grammar};`);
        console.log(`      run \`npm run snapshots:update\` to record its golden, then review the diff`);
        return;
    }

    const golden = readFileSync(file, 'utf8');
    if (golden !== serialized) {
        failures++;
        console.log(`  ✗ ${grammar}/${slugOf(name)} differs from golden (corpus file ${name})`);
        console.log(`      run \`npm run snapshots:update\` to refresh if the change is intended`);
        // Surface a short diff hint: first differing token index.
        try {
            const a = JSON.parse(golden);
            const b = tokens;
            const n = Math.max(a.length, b.length);
            for (let i = 0; i < n; i++) {
                if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
                    console.log(`      first diff at token ${i}: golden=${JSON.stringify(a[i])} got=${JSON.stringify(b[i])}`);
                    break;
                }
            }
        } catch { /* golden not parseable, the textual mismatch is enough */ }
        return;
    }
    passed++;
}

// ----- Inline sanity checks (review for obvious wrongness). -----
function sanityPrism(name, source, tokens) {
    // A heading line `# X` must be a column-0 marker: the first non-empty line
    // begins with `#`, and the grammar must produce a heading/title token whose
    // text starts with the `#` run. Only assert when the source actually opens
    // with a heading marker at column 0.
    // MARKER REQUIRES CONTENT: `#  ` with nothing after it is prose, so the
    // precondition has to be the language's rule and not `\s`, which matches
    // the line's own newline. Corpus 84-single-line-headings-5 is exactly that
    // document, and it made this check demand a heading token for a paragraph.
    // The separator is a LITERAL SPACE. A tab after the marker leaves the line
    // as prose (spec markup-carve/carve#802, corpus
    // `231-a-tab-after-a-heading-quote-or-caption-marker-leaves-the-line-as-prose`),
    // so `#<TAB>Heading` is a paragraph and produces no section scope - which
    // this check read as the grammar losing a heading. Whitespace AFTER the
    // separator space is still fine.
    if (/^#{1,6} [ \t]*(?![ \t]*$)/.test(source.split('\n')[0])) {
        const headingLike = tokens.find((t) => /(^|>)title$/.test(t.type) || /(^|>)title>/.test(t.type));
        assert.ok(
            headingLike,
            `prism/${name}: source opens with a heading marker but produced no title token`,
        );
    }
}

function sanityHljs(name, source, tokens) {
    // Front matter (a leading `---` fence) must only be scoped at the very
    // start: the first scoped 'meta' token, if any, must not appear after real
    // body content. We check the weaker, robust invariant that a heading line
    // still yields a 'section' scope somewhere (headings survive).
    // Same LITERAL SPACE rule as the prism sanity check above - the two copies
    // of this test are why the first patch left this one deciding the old way.
    if (/^#{1,6} [ \t]*(?![ \t]*$)/.test(source.split('\n')[0])) {
        const hasSection = tokens.some((t) => t.scope === 'section');
        assert.ok(
            hasSection,
            `hljs/${name}: source opens with a heading but produced no section scope`,
        );
    }
}

const corpus = listCorpusFiles();
const categories = [...new Set(corpus.map((f) => f.category))];
const prismCovered = coveredCategories('prism', categories);
const hljsCovered = coveredCategories('highlightjs', categories);
const notCompared = { prism: [], highlightjs: [] };

for (const file of corpus) {
    if (!prismCovered.has(file.category)) notCompared.prism.push(file.name);
    if (!hljsCovered.has(file.category)) notCompared.highlightjs.push(file.name);
    if (prismCovered.has(file.category)) {
        const tokens = prismTokens(file.source);
        sanityPrism(file.name, file.source, tokens);
        snapshot('prism', file.name, tokens);
    }
    if (hljsCovered.has(file.category)) {
        const tokens = hljsTokens(file.source);
        sanityHljs(file.name, file.source, tokens);
        snapshot('highlightjs', file.name, tokens);
    }
}

/*
 * ORPHAN GOLDENS: a golden whose corpus file is gone.
 *
 * The comparison above is one-sided by construction. It walks the CORPUS and
 * asks each file for its golden, so a NEW corpus file is a hard failure (no
 * golden) - but a REMOVED one is invisible, because nothing ever walks the
 * goldens and asks which corpus file they belong to. The directory only grows.
 *
 * That direction matters more than it sounds. A stale golden is a recorded
 * answer to a question the language stopped asking, and it reads exactly like
 * a live one: same shape, same slug, sitting in the same directory. It also
 * hides a corpus that SHRANK - delete a document upstream and this suite stays
 * green with the golden still in the tree, so `snapshots:update` keeps
 * rewriting a file for a document that no longer exists.
 *
 * Measured while adding this: four goldens per grammar had outlived their
 * category (`a-semantic-span-keeps-its-wrapper-unless-consumption-empties-it`,
 * retired upstream), and nothing here could say so.
 */
{
    const liveSlugs = new Set(corpus.map((f) => slugOf(f.name)));
    const orphans = [];
    for (const grammar of ['prism', 'highlightjs']) {
        const dir = `${SNAP_DIR}/${grammar}`;
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir)) {
            if (!file.endsWith('.json')) continue;
            const slug = file.replace(/\.json$/, '');
            if (!liveSlugs.has(slug)) orphans.push(`${grammar}/${file}`);
        }
    }
    if (orphans.length) {
        failures += orphans.length;
        console.log(`  \u2717 ${orphans.length} golden(s) have no corpus file:`);
        for (const o of orphans.sort()) console.log(`      - ${o}`);
        console.log('      the corpus document was removed or renamed upstream;');
        console.log('      delete the golden, or restore the document it belongs to');
    }
}

/*
 * HOW MANY DOCUMENTS WERE COMPARED, reconciled against the corpus.
 *
 * The loop above reads a document only when its category is covered, and for
 * a highlighter `coveredCategories` returns "everything not explicitly
 * skipped". So one entry in `COVERAGE.prism.skip` removes a whole category
 * from this run, and every gate stays green: the coverage partition compares
 * the derived list with the list it was derived from, and the orphan sweep
 * below only sees goldens whose corpus file is GONE, not goldens nobody read.
 * Measured on `326-...`, 29 documents: 3480 compared became 3451 and both
 * tests passed (markup-carve/carve-grammars#513).
 *
 * The expectation is DERIVED, not recorded: `listCorpusFiles` already
 * reconciles the corpus against the count the spec pin declares, so two
 * grammars over that corpus is the whole population. A skip for a highlighter
 * is refused outright rather than accounted for, because `covered + skipped`
 * is the same number either way - which is the identity that let the shrink
 * through.
 */
for (const grammar of ['prism', 'highlightjs']) {
    assert.deepStrictEqual(
        notCompared[grammar], [],
        `${grammar} skips ${notCompared[grammar].length} corpus document(s), starting with `
        + `${notCompared[grammar][0]}. A highlighter tokenizes arbitrary text, so `
        + 'tests/lib/coverage.js declares no skips for it and this suite reads every document. '
        + 'A deliberate skip has to change this assertion and say what it buys.',
    );
}
assert.strictEqual(
    compared, 2 * corpus.length,
    `${compared} snapshot comparisons over ${corpus.length} corpus documents and two grammars, `
    + `not ${2 * corpus.length}`,
);

console.log('');
if (written) console.log(`  ${written} snapshot${written === 1 ? '' : 's'} written`);
if (passed) console.log(`  ${passed} snapshot${passed === 1 ? '' : 's'} matched`);
console.log(`  ${compared} comparison${compared === 1 ? '' : 's'} over ${corpus.length} corpus documents`);

assert.strictEqual(failures, 0, `${failures} snapshot(s) differ from golden`);

console.log(`\nsnapshots OK`);
