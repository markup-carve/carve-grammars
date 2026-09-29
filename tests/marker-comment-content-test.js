/**
 * A heading or list marker whose whole content is a `%%` comment keeps its own
 * scope (carve-grammars#578).
 *
 * The engine renders a real block for these: `# %% h` is `<h1></h1>` and
 * `- %% h` is `<li></li>`, measured with the released carve package 0.1.7. Prism
 * used to carve the comment out first, leaving `# ` and `- ` to fail MARKER
 * REQUIRES CONTENT, so the marker went unscoped while highlight.js and the
 * TextMate grammars scoped it.
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

console.log('a marker whose content is only a comment:');

// [source, the marker text that must carry a scope]
const rows = [
    ['# %% h', '#'],
    ['## %% h', '##'],
    ['- %% h', '- '],
    ['* %% h', '* '],
    ['1. %% h', '1. '],
];

const scopeOver = (tokens, source, text) => {
    const at = source.indexOf(text);
    let offset = 0;
    for (const token of tokens) {
        const end = offset + token.text.length;
        if (offset <= at && at < end) return token.scope;
        offset = end;
    }
    return undefined;
};

for (const [source, marker] of rows) {
    ok(`prism scopes the marker of ${JSON.stringify(source)}`, () => {
        const scope = scopeOver(prismTokens(source), source, marker);
        assert.ok(
            scope && /title|list/.test(scope),
            `expected a title or list scope over ${JSON.stringify(marker)}, got ${JSON.stringify(scope)}`,
        );
    });

    ok(`prism scopes the comment of ${JSON.stringify(source)}`, () => {
        const scope = scopeOver(prismTokens(source), source, '%%');
        assert.ok(
            scope && /comment/.test(scope),
            `expected a comment scope over the marker's comment, got ${JSON.stringify(scope)}`,
        );
    });

    ok(`highlightjs scopes the marker of ${JSON.stringify(source)}`, () => {
        const scope = scopeOver(hljsTokens(source), source, marker.trim() || marker);
        assert.ok(scope, `expected any scope over ${JSON.stringify(marker)}, got ${JSON.stringify(scope)}`);
    });
}

// A trailing `%%%` RUN is not this shape: no block rule can take it, so it stays
// a line comment wherever it sits, and corpus 326-...-6 pins that.
ok('a trailing %%% run after a marker is still a comment', () => {
    const source = '- %%%\nc\n%%%\n';
    const scope = scopeOver(prismTokens(source), source, '%%%');
    assert.ok(scope && /comment/.test(scope), `got ${JSON.stringify(scope)}`);
});

// A TAB separator leaves the line as prose, so no block rule claims it and the
// comment must stay a top-level comment (codex caught this as a regression of
// the first patch).
for (const source of ['#\t%% h', '-\t%% h', '1.\t%% h']) {
    ok(`a tab-separated marker keeps its comment: ${JSON.stringify(source)}`, () => {
        const scope = scopeOver(prismTokens(source), source, '%%');
        assert.equal(scope, 'comment');
    });
}

// CRLF: the list tail must stop before the carriage return, or the comment sits
// inside one punctuation token with no comment scope of its own (codex caught
// this as a regression of the second patch).
for (const source of ['- %% h\r\n', '# %% h\r\n']) {
    ok(`a CRLF line still scopes the comment: ${JSON.stringify(source)}`, () => {
        const scope = scopeOver(prismTokens(source), source, '%%');
        assert.ok(scope && /comment/.test(scope), `got ${JSON.stringify(scope)}`);
    });
}

// Text before the comment is the ordinary shape and must not move.
ok('a marker with text before the comment is unchanged', () => {
    const tokens = prismTokens('# T %% h');
    assert.equal(scopeOver(tokens, '# T %% h', '#'), 'title>important>punctuation');
    assert.equal(scopeOver(tokens, '# T %% h', '%%'), 'comment');
});

for (const [name, tokenize] of await textmateEngines()) {
    ok(`${name} scopes the marker of "# %% h"`, () => {
        const scope = scopeOver(tokenize('# %% h'), '# %% h', '#');
        assert.ok(scope, `expected any scope over the heading marker, got ${JSON.stringify(scope)}`);
    });
}

console.log(`\n${passed} passed`);
