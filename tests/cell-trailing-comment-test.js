/**
 * A trailing `%%` comment in a table cell ENDS AT THE CELL (carve-grammars#576,
 * #577).
 *
 * A cell is an inline run of its own (`CARVE-P9-041`), and corpus
 * `518-a-trailing-comment-takes-a-tab-a-run-start-and-its-whole-separator-6`
 * pins the reading: `| %% hidden | b |` keeps two header cells. Prism and the
 * TextMate grammar ran the comment to the line end and swallowed every later
 * separator; highlight.js bounded it correctly but gave it no scope at all.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('a trailing comment inside a table cell:');

const scopeOver = (tokens, source, text, from = 0) => {
    const at = source.indexOf(text, from);
    let offset = 0;
    for (const token of tokens) {
        const end = offset + token.text.length;
        if (offset <= at && at < end) return token.scope;
        offset = end;
    }
    return undefined;
};

// [row, the comment run]. The separator AFTER the comment is what the swallow
// destroyed, and it is the one thing every surface scopes - highlight.js gives
// cell TEXT no scope at all, in a control row just as much as here.
const rows = [
    ['| a %% h | b |', '%%'],
    ['| a %%% h | b |', '%%%'],
    ['| %% h | b |', '%%'],
    // An ESCAPED pipe stays inside the comment: the engine renders cells `a` and
    // `b` for this row, so the comment reaches past the `\\|` (codex caught the
    // first patch terminating there).
    ['| a %% h \\| hidden | b |', '%%'],
];

const surfaces = [
    ['prism', prismTokens],
    ['highlightjs', hljsTokens],
    ...(await textmateEngines()),
];

for (const [source, comment] of rows) {
    for (const [name, tokenize] of surfaces) {
        ok(`${name} scopes the comment of ${JSON.stringify(source)}`, () => {
            const scope = scopeOver(tokenize(source), source, comment);
            assert.ok(scope && /comment/.test(scope), `got ${JSON.stringify(scope)}`);
        });

        ok(`${name} keeps the separator after the comment in ${JSON.stringify(source)}`, () => {
            // The separator that OPENS THE NEXT CELL, found by its text rather
            // than by the first pipe after the comment - in the escaped row that
            // first pipe is `\\|` and belongs to the comment.
            const at = source.indexOf('| b |');
            const scope = scopeOver(tokenize(source), source, '| b |', at);
            assert.ok(
                scope && /table/.test(scope),
                `expected a table scope over the separator at ${at}, got ${JSON.stringify(scope)}`,
            );
        });
    }
}

// OUTSIDE a row the run still reaches the line end, pipe and all.
for (const [name, tokenize] of [['prism', prismTokens], ['highlightjs', hljsTokens], ...(await textmateEngines())]) {
    ok(`${name} leaves a paragraph comment reaching the line end`, () => {
        const source = 'a %% h | b';
        const tokens = tokenize(source);
        const scope = scopeOver(tokens, source, '%%');
        assert.ok(scope && /comment/.test(scope), `got ${JSON.stringify(scope)}`);
        assert.equal(scopeOver(tokens, source, 'b'), scope, 'the pipe and the text after it stay inside the comment');
    });
}

console.log(`\n${passed} passed`);
