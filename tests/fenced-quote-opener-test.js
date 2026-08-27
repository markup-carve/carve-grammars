/**
 * `::: >` IS A CONTAINER OPENER IN EVERY GRAMMAR THIS REPOSITORY SHIPS.
 *
 * The fenced block quote (markup-carve/carve#1718) is the third member of the
 * sigil-fence family, beside the line block and the local hard-break block.
 * Like both of them its type token is NOT an identifier, so it reaches no
 * `::: name` rule - and every colon-fence rule here enumerated the pipe and the
 * backslash and stopped. The opener therefore matched nothing at all: not the
 * div rule, not any body rule, so the fence lines came back unscoped and the
 * quote's body was highlighted as top-level text rather than as a container's.
 *
 * Two properties, and the second is the one a regex gets wrong. The opener
 * scopes, and the separator is a SPACE RUN: a glued marker opens nothing, and
 * neither does a tab anywhere in the run - `:::<TAB>>`, `:::<TAB> >` and
 * `::: <TAB>>` are all paragraph text in every engine, while two spaces open
 * the container. A tab belongs at the START of a line and nowhere else on one.
 *
 * The same run appears before every other colon-fence token, and every one of
 * them accepted a tab (carve-grammars#355): corpus 254 and 255 exist to pin
 * exactly this rule, and all three grammars coloured their documents as
 * containers. Fixed in the same sweep, since it is one character class in one
 * pattern per grammar - the snapshot churn in this change is those documents
 * losing a scope they should never have had.
 *
 * The one branch that is NOT a space run is the bare `[label]`: `:::[l]` opens
 * a div, measured, so that branch takes ` *` where the rest take ` +`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const ENGINES = [['prism', prismTokens], ['highlightjs', hljsTokens], ...await textmateEngines()];

assert.ok(
    ENGINES.some(([id]) => id === 'textmate'),
    'the TextMate grammar in this repository was not reachable, so one of the three grammars '
        + 'would go unmeasured and this file would pass on it',
);

/*
 * THE SCOPE EACH GRAMMAR SPELLS A CONTAINER OPENER WITH.
 *
 * Three vocabularies for one fact: highlight.js calls the whole delimiter line
 * a `keyword`, Prism splits it into `div-delimiter` parts, and the TextMate
 * family says `punctuation.definition.admonition` plus `entity.name.tag`.
 *
 * "Carries any scope at all" would have been the shorter predicate and it is
 * the wrong one: vscode-textmate stamps the language's own `source.carve` on
 * every leaf, including plain paragraph text, so on that grammar the short
 * predicate answers true for every input and the negative rows below would
 * pass on a grammar that opens a container for `:::>`.
 */
const OPENER_SCOPE = {
    prism: /div-delimiter/,
    highlightjs: /keyword/,
    'intellij-carve': /keyword\.control\.div|entity\.name\.type\.div/,
};
const openerScopeOf = (surface) =>
    OPENER_SCOPE[surface] ?? /punctuation\.definition\.admonition|entity\.name\.tag/;

function scopesTheOpener(surface, tokenize, source) {
    const scope = openerScopeOf(surface);
    // The FIRST fence leaf, which is the opener. A later one is the closing
    // fence, and a bare closer is a legitimate opener shape in every grammar
    // here - so asking whether ANY fence leaf is scoped answers yes for a
    // document whose opener matched nothing at all.
    const opener = tokenize(source).find((leaf) => leaf.text.includes(':::'));

    return Boolean(opener && opener.scope && scope.test(opener.scope));
}

console.log('the opener scopes, in every grammar:');

for (const [id, tokenize] of ENGINES) {
    ok(`${id}: a fenced quote opener opens a container`, () => {
        assert.ok(
            scopesTheOpener(id, tokenize, '::: >\nNotes:\n:::\n'),
            'the fence line came back unscoped, so the opener matched no rule',
        );
    });
}

console.log('\nthe separator is a space run:');

for (const [id, tokenize] of ENGINES) {
    ok(`${id}: a glued marker opens nothing`, () => {
        assert.equal(scopesTheOpener(id, tokenize, ':::>\nx\n:::\n'), false);
    });
    ok(`${id}: a tab after the fence opens nothing`, () => {
        assert.equal(scopesTheOpener(id, tokenize, ':::\t>\nx\n:::\n'), false);
    });
    // A separator that MIXES the two is the case a lookbehind on the last
    // character alone gets wrong, and it renders as a paragraph like the rest.
    ok(`${id}: a tab before a space opens nothing`, () => {
        assert.equal(scopesTheOpener(id, tokenize, ':::\t >\nx\n:::\n'), false);
    });
    ok(`${id}: a space before a tab opens nothing`, () => {
        assert.equal(scopesTheOpener(id, tokenize, '::: \t>\nx\n:::\n'), false);
    });
    // More than one space IS a separator: the rule is a space RUN.
    ok(`${id}: two spaces still open the container`, () => {
        assert.equal(scopesTheOpener(id, tokenize, ':::  >\nx\n:::\n'), true);
    });
}

console.log('\nevery other colon-fence token takes the same run:');

/*
 * Measured against carve-js `8432165e`; carve-php and carve-rs agree byte for
 * byte. The `[label]` row is the one branch that opens with NO separator, which
 * is why the sweep could not simply put ` +` everywhere.
 */
const SEPARATORS = [
    ['::: |', true],
    [':::|', false],
    [':::\t|', false],
    ['::: note', true],
    [':::note', false],
    [':::\tnote', false],
    ['::: [l]', true],
    [':::[l]', true],
    [':::\t[l]', false],
    ['::: note "T"', true],
    ['::: note\t"T"', false],
    ['::: note "T" [l]', true],
    ['::: note "T"\t[l]', false],
];

for (const [opener, opens] of SEPARATORS) {
    for (const [id, tokenize] of ENGINES) {
        ok(`${id}: ${JSON.stringify(opener)} ${opens ? 'opens' : 'stays text'}`, () => {
            assert.equal(scopesTheOpener(id, tokenize, `${opener}\nx\n:::\n`), opens);
        });
    }
}

/*
 * The npm `test` script is an explicit list of `node tests/*.js` invocations,
 * not a glob, so a file absent from it proves nothing in CI.
 */
ok('this file is in the npm test chain', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    const self = 'tests/fenced-quote-opener-test.js';
    assert.ok(
        pkg.scripts.test.includes(`node ${self}`),
        `package.json "test" does not run ${self}, so this file proves nothing in CI`,
    );
});

console.log(`\n${passed} passed`);
