/**
 * The continuation marker at RELATIVE column 0 (markup-carve/carve#3445),
 * measured against the spec model's own reading of every `+` in the corpus
 * rows that ruling added (sections 626-634) and the first-block rows of
 * markup-carve/carve#3482 and #3513 (sections 643-644), all in
 * `continuation-marker-relative.json`.
 *
 * The rule a grammar has to hold is one-sided: it may leave a marker unscoped
 * where it cannot prove it, but it may never scope a `+` the spec reads as
 * text. The misses are pinned, so a change that closes one or opens one shows
 * up here. TextMate sees one line at a time and cannot check the line below a
 * lone `+`, so it scopes only a `+` after a list or description marker on the
 * same line.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const { rows } = JSON.parse(readFileSync(new URL('./continuation-marker-relative.json', import.meta.url), 'utf8'));
const tm = await textmateLineTokenizer(fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url)));

const ENGINES = {
    textmate: { tokenize: tm, marks: (scope) => /continuation\.carve/.test(scope) },
    prism: { tokenize: prismTokens, marks: (scope) => /continuation/.test(scope) },
    highlightjs: { tokenize: hljsTokens, marks: (scope) => scope === 'punctuation' || scope === 'table-operator' },
};

// Text each grammar scopes anyway. TextMate scopes a quote's marker-line `+`
// without seeing the next line (carve-grammars#768).
const WRONG = {
    textmate: [
        '629-a-dangling-plus-marker-adds-nothing-and-a-nested-quote-reads-it-like-an-unnested-one-6 L2',
        '629-a-dangling-plus-marker-adds-nothing-and-a-nested-quote-reads-it-like-an-unnested-one-7 L2',
        '629-a-dangling-plus-marker-adds-nothing-and-a-nested-quote-reads-it-like-an-unnested-one-8 L2',
        '630-a-continuation-marker-stands-alone-at-column-zero-or-right-after-a-block-opener-4 L2',
        '633-a-first-block-marker-on-an-indented-opener-reads-two-columns-39 L2',
        '634-a-refused-continuation-plus-remains-text-13 L2',
    ],
};

// Markers each grammar cannot prove, as `<row id> L<line>`.
const MISSED = {
    textmate: 33,
    prism: [
        // A tab-indented `+`: the column needs tab expansion.
        '632-a-continuation-marker-uses-its-container-column-22 L4',
        // The open container's marker sits after another marker on its line (`- > a`).
        '634-a-refused-continuation-plus-remains-text-21 L2',
        '634-a-refused-continuation-plus-remains-text-22 L3',
    ],
    highlightjs: [
        // The `+` ends a nested item's open fence, which the fence mode has already taken.
        '632-a-continuation-marker-uses-its-container-column-16 L3',
        '632-a-continuation-marker-uses-its-container-column-22 L4',
        '634-a-refused-continuation-plus-remains-text-21 L2',
        '634-a-refused-continuation-plus-remains-text-22 L3',
    ],
};

const withOffsets = (tokens) => {
    let at = 0;
    return tokens.map((token) => {
        const out = { ...token, start: at };
        at += token.text.length;
        return out;
    });
};

for (const [name, { tokenize, marks }] of Object.entries(ENGINES)) {
    const wrong = [];
    const missed = [];
    for (const row of rows) {
        const tokens = withOffsets(tokenize(row.source));
        const lines = row.source.split('\n');
        for (const [line, col, verdict] of row.plus) {
            const offset = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0) + col;
            const token = tokens.find((t) => t.start <= offset && offset < t.start + t.text.length);
            const scoped = Boolean(token && marks(token.scope ?? ''));
            if (scoped && verdict === 'text') wrong.push(`${row.id} L${line}`);
            if (!scoped && verdict === 'marker') missed.push(`${row.id} L${line}`);
        }
    }
    assert.deepEqual(wrong, WRONG[name] ?? [], `${name}: scopes a + the spec reads as text`);
    if (typeof MISSED[name] === 'number') {
        assert.equal(missed.length, MISSED[name], `${name}: unscoped markers moved: ${missed.join(', ')}`);
    } else {
        assert.deepEqual(missed, MISSED[name], `${name}: unscoped markers moved`);
    }
    const total = rows.reduce((sum, row) => sum + row.plus.length, 0);
    console.log(`  ✓ ${name}: ${total - missed.length}/${total} agree with the spec model, ${missed.length} marker(s) left unscoped`);
}
