/**
 * An inline attribute block is syntax only where it attaches: glued to the
 * construct before it, glued to a list marker, or filling its line as a
 * standalone or floating block (carve-grammars#467). Every row was rendered
 * through the executable grammar at carve ac1af6a.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

// [source, the block, attaches, surfaces the row does not hold]
// Prism applies a pattern to the chunk left after earlier tokens, so a line
// start and a block glued to a finished token look the same to it. TextMate
// cannot tell an image's `)` from an ordered marker's.
const rows = [
    ['a {.c} b', '{.c}', false],
    ['a{.c}', '{.c}', false],
    ['"q"{.c}', '{.c}', false],
    ['@u{k=v.w}', '{k=v.w}', false],
    ['- {.c} text', '{.c}', false],
    ['{.c} para', '{.c}', false],
    ['![alt](img.png) {.x}', '{.x}', false, ['textmate']],
    ['[a]: /u\t{.c}', '{.c}', false],
    // Prism and highlight.js keep a definition's trailing block inside the
    // definition token; TextMate scopes it as attributes.
    ['[a]: /u {.c}', '{.c}', true, ['prism', 'highlightjs']],
    ['*b*{.c}', '{.c}', true],
    ['`x`{.c}', '{.c}', true],
    ['-{.c} item', '{.c}', true],
    ['- {a=b .c}\n  # H', '{a=b .c}', true],
    ['{.c}\npara', '{.c}', true],
    ['{.c}{#i}\n# H', '{.c}', true],
    ['  {.x}\n  - b', '{.x}', true],
    ['{title="a\\"b"}\n# H', '{title="a\\"b"}', true],
];

const surfaces = [
    ['prism', prismTokens, (s) => /attributes/.test(s ?? '')],
    ['highlightjs', hljsTokens, (s) => s === 'attr'],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, (s) => /meta\.attributes/.test(s ?? '')]),
];

let checked = 0;
for (const [name, tokenize, isAttr] of surfaces) {
    for (const [source, block, attaches, pending = []] of rows) {
        if (pending.includes(name)) continue;
        const tokens = await tokenize(`${source}\n`);
        const at = source.indexOf(block);
        let offset = 0;
        const token = tokens.find((t) => (offset += t.text.length) > at);
        assert.equal(isAttr(token?.scope), attaches, `${name}: ${JSON.stringify(source)} ${attaches ? 'scopes' : 'leaves literal'} ${block}`);
        checked++;
    }
}

console.log(`attribute attachment: ${checked} rows across ${surfaces.length} surfaces`);
