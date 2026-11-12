/**
 * A block glued to a delimiter that closes no run is text (carve-grammars#867):
 * carve-js renders `a*{.q}` as `<p>a*{.q}</p>` and `*a*{.q}` as
 * `<p><strong class="q">a</strong></p>`. Each row is checked at the top level,
 * in a quote and in a list item.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

// [line, attaches, surfaces the row does not hold]
const rows = [
    ['a*{.q}', false],
    ['a/{.q}', false],
    ['a_{.q}', false],
    ['a~{.q}', false],
    ['a={.q}', false],
    ['x _a_ b_{.q}', false],
    ['x *a* b*{.q}', false],
    ['x ~a~ b~{.q}', false],
    // TextMate reads no block a `}` closes (carve-grammars#847 left it out).
    ['a*{.q}{#i}', false, ['textmate']],
    ['*a*{.q}', true],
    ['/a/{.q}', true],
    ['_a_{.q}', true],
    ['~a~{.q}', true],
    ['=a={.q}', true],
    ['/*a*/{.q}', true],
    ['*/a/*{.q}', true],
    ['x *a b*{.q} z', true],
    ['*a*{.q}{#i}', true],
];

const surfaces = [
    ['prism', prismTokens, (s) => /attributes/.test(s ?? '')],
    ['highlightjs', hljsTokens, (s) => s === 'attr'],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, (s) => /meta\.attributes/.test(s ?? '')]),
];

const scopeAt = (tokens, at) => {
    let offset = 0;
    return tokens.find((t) => (offset += t.text.length) > at)?.scope;
};

let checked = 0;
for (const [name, tokenize, isAttr] of surfaces) {
    for (const [line, attaches, pending = []] of rows) {
        if (pending.some((surface) => name.startsWith(surface))) continue;
        for (const prefix of ['', '> ', '- ', '> - ']) {
            const source = prefix + line;
            const tokens = await tokenize(`${source}\n`);
            const at = source.lastIndexOf('{');
            assert.equal(isAttr(scopeAt(tokens, at)), attaches, `${name}: ${JSON.stringify(source)} ${attaches ? 'scopes' : 'leaves literal'} its last block`);
            checked++;
        }
    }
}

console.log(`unclosed delimiter attributes: ${checked} rows across ${surfaces.length} surfaces`);
