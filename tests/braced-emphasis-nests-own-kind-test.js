/*
 * A braced emphasis span nests its own kind (carve#2904): `*a {*b*} c*` is
 * `<strong>a <strong>b</strong> c</strong>`, and the empty `{**}` inside a
 * run is text that never closes it. The three grammars ended the outer run at
 * the inner closer, the reading from before that ruling.
 *
 * The expected depths come from the spec corpus (`471-braced-emphasis-can-
 * nest-its-own-kind`) and from carve-js main. The engine pinned in
 * package.json predates the ruling, so it cannot be the oracle here yet.
 *
 * Each row gives, per source character, how many spans of one kind enclose
 * it, delimiters counted inside their own span.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hljsTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

assertThisFileRuns(import.meta.url);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const tokenizeTm = await textmateLineTokenizer(resolve(repoRoot, 'textmate/carve.tmLanguage.json'));

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const KINDS = {
    strong: { prism: ['bold', 'forced-bold'], hljs: 'strong', tm: 'bold' },
    em: { prism: ['italic', 'forced-italic'], hljs: 'emphasis', tm: 'italic' },
    mark: { prism: ['highlight'], hljs: 'addition', tm: 'highlight' },
    sup: { prism: ['superscript'], hljs: 'built_in', tm: 'superscript' },
};

function prismDepths(source, kind) {
    const out = [];
    const walk = (tokens, depth) => {
        for (const tok of tokens) {
            if (typeof tok === 'string') {
                out.push(...Array(tok.length).fill(depth));
                continue;
            }
            const inner = depth + (KINDS[kind].prism.includes(tok.type) ? 1 : 0);
            walk(Array.isArray(tok.content) ? tok.content : [tok.content], inner);
        }
    };
    walk(Prism.tokenize(source, Prism.languages.carve), 0);
    return out.join('');
}

function hljsDepths(source, kind) {
    return hljsTokens(source)
        .map((t) => String(t.ancestors.filter((a) => a === KINDS[kind].hljs).length).repeat(t.text.length))
        .join('');
}

// A TextMate span is a content scope plus a punctuation scope on each delimiter.
function tmDepths(source, kind) {
    const names = [`markup.${KINDS[kind].tm}.carve`, `punctuation.definition.${KINDS[kind].tm}.carve`];
    return tokenizeTm(source)
        .map((t) => String(t.scope.split(' ').filter((s) => names.includes(s)).length).repeat(t.text.length))
        .join('');
}

const ENGINES = [['prism', prismDepths], ['highlightjs', hljsDepths], ['textmate', tmDepths]];

const ROWS = [
    ['a{*{*x*}*}b', 'strong', '01122222110', 'corpus 471: a braced strong directly inside one'],
    ['*a {*b*} c*', 'strong', '11122222111', 'corpus 471-2: a braced strong inside a bare one'],
    ['{/a *b {/c/}*/}', 'em', '111111122222111', 'corpus 471-4: a braced em inside a strong inside a braced em'],
    ['{/a *b {/c/}*/}', 'strong', '000011111111100', 'corpus 471-4: the strong between them closes at its own star'],
    ['{*a {**} b*}', 'strong', '111111111111', 'corpus 471-10: the empty `{**}` is text inside the run'],
    ['*a {**} b*', 'strong', '1111111111', 'the empty `{**}` inside a bare run'],
    ['{*{*{*x*}*}*}', 'strong', '1122333332211', 'three levels'],
    ['/a {/b/} c/', 'em', '11122222111', 'a braced em inside a bare one'],
    ['=a {=b=} c=', 'mark', '11122222111', 'a braced highlight inside a bare one'],
    ['{^a {^b^} c^}', 'sup', '1111222221111', 'a braced superscript inside one'],
    ['*a /x {*b*} y/ c*', 'strong', '11111122222111111', 'a nested strong inside an em inside a strong'],
    ['*a /x {*b*} y/ c*', 'em', '00011111111111000', 'the em around it is not cut short by the nested closer'],
    ['{*a {/b *} d/} e*}', 'strong', '111111111111111111', 'another kind still makes the star text'],
];

/*
 * The limit a line-based grammar cannot lift: `strong` is the one bare rule
 * spelled begin/end, so it opens without seeing whether its closer exists
 * (tests/bold-unclosed-test.js). When the only star that could close it sits
 * inside a nested `{*...*}`, it stays open to the end of the paragraph.
 */
const TEXTMATE_RESIDUALS = new Map([
    ['*a {*b*} c', '1112222211'],
    ['*a {*b c*}', '1112222222'],
]);
ROWS.push(
    ['*a {*b*} c', 'strong', '0001111100', 'an unclosed bare opener around a closed braced span'],
    ['*a {*b c*}', 'strong', '0001111111', 'an outer bare opener whose only closer is inside the nested span'],
);

for (const [name, depths] of ENGINES) {
    console.log(`\n${name}:`);
    for (const [source, kind, expected, why] of ROWS) {
        assert.equal(expected.length, source.length, `the expectation for ${JSON.stringify(source)} is misaligned`);
        const want = name === 'textmate' && TEXTMATE_RESIDUALS.has(source) ? TEXTMATE_RESIDUALS.get(source) : expected;
        ok(`${why} (${kind})`, () => {
            assert.equal(depths(source, kind), want,
                `${name} on ${JSON.stringify(source)}: ${kind} depth per character`);
        });
    }
}

console.log(`\n${passed} checks passed`);
