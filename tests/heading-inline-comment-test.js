/**
 * A HEADING'S TITLE IS AN INLINE RUN, both ways (carve-grammars#601,
 * markup-carve/carve#2682).
 *
 * carve-js 0.1.4 and carve-php 685e94fa3 agree byte for byte: a backtick run on
 * a heading line keeps a `%%` inside it as code content, and a real trailing
 * `%%` is stripped. Corpus section 516 pins both.
 *
 * ```
 * # a `x %% b` c   ->  <h1>a <code>x %% b</code> c</h1>
 * # a %% hidden    ->  <h1>a</h1>
 * ```
 *
 * Three surfaces disagreed, in two directions. Prism ran its top-level comment
 * rule inside the code span; TextMate/Shiki and highlight.js ran no comment rule
 * inside the title at all, so the stripped bytes were painted as heading text.
 *
 * ONE ASSERTION PER SURFACE PER DIRECTION, each in its own `ok`. A suite stops at
 * the first failing assertion inside a test, so a shared test would hide every
 * surface after the first to break.
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

const surfaces = [['prism', prismTokens], ['highlightjs', hljsTokens], ...(await textmateEngines())];

console.log('a %% between backticks on a heading line is code content:');

const SPAN = '# a `x %% b` c';

for (const [name, tokenize] of surfaces) {
    ok(`${name} scopes no comment over the %% inside a heading's code span`, () => {
        const scope = scopeOver(tokenize(SPAN), SPAN, '%%');
        assert.ok(
            scope && !/comment/.test(scope),
            `expected a non-comment scope over the %% in ${JSON.stringify(SPAN)}, got ${JSON.stringify(scope)}`,
        );
    });

    ok(`${name} scopes the heading's code span as verbatim`, () => {
        const scope = scopeOver(tokenize(SPAN), SPAN, 'x %% b');
        assert.ok(
            scope && /code|raw/.test(scope),
            `expected a code or raw scope over the span body, got ${JSON.stringify(scope)}`,
        );
    });
}

console.log('\na real trailing %% on a heading is a comment:');

// Behind a space and behind a tab alike - the engine strips both.
for (const [name, tokenize] of surfaces) {
    for (const source of ['# a %% hidden', '# a\t%% hidden']) {
        ok(`${name} scopes the trailing comment of ${JSON.stringify(source)}`, () => {
            const scope = scopeOver(tokenize(source), source, '%%');
            assert.ok(
                scope && /comment/.test(scope),
                `expected a comment scope over the trailing run, got ${JSON.stringify(scope)}`,
            );
        });

        ok(`${name} keeps the heading text of ${JSON.stringify(source)} out of the comment`, () => {
            const scope = scopeOver(tokenize(source), source, 'a');
            assert.ok(
                scope && !/comment/.test(scope),
                `expected the title text to carry no comment scope, got ${JSON.stringify(scope)}`,
            );
        });
    }
}

console.log('\nthe other direction still holds - a comment body is verbatim:');

// The symmetric case, which a naive "code before comment" reorder would break:
// the `%%` opens FIRST here, so the backticks after it are comment body.
const INSIDE = '# a %% see `x` here';

for (const [name, tokenize] of surfaces) {
    ok(`${name} keeps backticks after a heading's %% inside the comment`, () => {
        const tokens = tokenize(INSIDE);
        const scope = scopeOver(tokens, INSIDE, '%%');
        assert.ok(scope && /comment/.test(scope), `expected a comment scope, got ${JSON.stringify(scope)}`);
        assert.equal(
            scopeOver(tokens, INSIDE, '`x`'),
            scope,
            'the backtick run after the comment opener is comment body',
        );
    });
}

console.log(`\n${passed} passed`);
