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
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listCorpusFiles } from './lib/corpus.js';
import { coveredCategories, slugOf } from './lib/coverage.js';

const require = createRequire(import.meta.url);
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const SNAP_DIR = fileURLToPath(new URL('./snapshots', import.meta.url));

let passed = 0;
let written = 0;
let failures = 0;

console.log('carve-grammars highlight snapshots:');

// ----- Prism setup (mirror tests/grammar-test.js: choose the host, then a
// single dynamic import that reads globalThis.Prism). -----
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const carveGrammar = Prism.languages.carve;

/** Flatten a Prism token tree to leaf {type, text} entries with a type path. */
function prismLeaves(tokens, parentPath = '') {
    const out = [];
    for (const tok of tokens) {
        if (typeof tok === 'string') {
            out.push({ type: parentPath || 'text', text: tok });
            continue;
        }
        const path = parentPath ? `${parentPath}>${tok.type}` : tok.type;
        if (Array.isArray(tok.content)) {
            out.push(...prismLeaves(tok.content, path));
        } else if (tok.content && typeof tok.content === 'object') {
            out.push(...prismLeaves([tok.content], path));
        } else {
            out.push({ type: path, text: String(tok.content) });
        }
    }
    return out;
}

function prismTokens(source) {
    return prismLeaves(Prism.tokenize(source, carveGrammar));
}

// ----- highlight.js setup -----
const hljs = require('highlight.js');
const hljsCarve = (await import('../highlightjs/carve.mjs')).default;
hljs.registerLanguage('carve', hljsCarve);

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
function unescapeHtml(s) {
    return s.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (m) => ENTITIES[m]);
}

/**
 * Scan highlight.js HTML output into a flat list of {scope, text} entries, where
 * scope is the innermost hljs-* class covering the text (null when unscoped).
 */
function hljsTokens(source) {
    const { value } = hljs.highlight(source, { language: 'carve' });
    const out = [];
    const scopeStack = [];
    const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
    let m;
    while ((m = re.exec(value)) !== null) {
        if (m[1] !== undefined) {
            const cls = m[1].replace(/^hljs-/, '');
            scopeStack.push(cls);
        } else if (m[2] !== undefined) {
            const text = unescapeHtml(m[2]);
            const scope = scopeStack.length ? scopeStack[scopeStack.length - 1] : null;
            out.push({ scope, text });
        } else {
            scopeStack.pop();
        }
    }
    return out;
}

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

for (const file of corpus) {
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

console.log('');
if (written) console.log(`  ${written} snapshot${written === 1 ? '' : 's'} written`);
if (passed) console.log(`  ${passed} snapshot${passed === 1 ? '' : 's'} matched`);

assert.strictEqual(failures, 0, `${failures} snapshot(s) differ from golden`);

console.log(`\nsnapshots OK`);
