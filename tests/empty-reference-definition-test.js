import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const surfaces = [
    ['prism', prismTokens, 'reference-definition'],
    ['highlightjs', hljsTokens, 'symbol'],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, 'meta.link.reference.def']),
];

for (const [name, tokenize, scope] of surfaces) {
    for (const [source, expected] of [
        ['[r]:\n', true],
        ['[r]:   \n', true],
        ['[r]: /u\n', true],
        ['[^]:\n', false],
        ['[^]: /u\n', true],
        ['[@x]:\n', false],
        ['[r]: "x y"\n', false],
        ['[r]: {.c d}\n', false],
    ]) {
        const tokens = await tokenize(source);
        assert.equal(tokens.some((token) => token.scope?.includes(scope) && token.text.includes(']:')), expected, `${name}: ${JSON.stringify(source)}`);
    }
}

console.log(`empty reference definitions: ${surfaces.length * 6} cases`);
