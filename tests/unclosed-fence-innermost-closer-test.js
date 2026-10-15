/**
 * Inside an unclosed fence only the innermost container's own closer is
 * structural (spec corpus 597). Prism holds nested containers flat in one
 * token, so its unclosed-fence rule has to find the fence's real host; it used
 * to run to the outermost closer and color the inner container's closer as
 * code. highlight.js, which nests modes, is held to the same rows. The parser
 * is not asked: carve-js 0.1.11, the version pinned here, predates the ruling.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const FENCE = '`'.repeat(3);
const doc = (...lines) => lines.join('\n') + '\n';

// Each row: the source, the colon lines that are code, and the ones that are
// container delimiters, in source order.
const rows = [
    ['597, nested', doc('::: outer', ':::: inner', FENCE, 'code', ':::', '::::', ':::', 'after *b*'), [':::'], ['::::', ':::']],
    ['597-2, widths swapped', doc(':::: outer', '::: inner', FENCE, 'code', '::::', ':::', '::::', 'after *b*'), ['::::'], [':::', '::::']],
    ['597-3, one container', doc('::: note', FENCE, 'code', '::::', ':::', 'after *b*'), ['::::'], [':::']],
    ['597-6, a comment above the fence', doc('::: outer', ':::: inner', '%% c', FENCE, 'code', ':::', '::::', ':::', 'after *b*'), [':::'], ['::::', ':::']],
    ['597-8, an item holding only a comment', doc('::: note', '- %% c', FENCE, 'code', '::::', ':::', 'after *b*'), ['::::'], [':::']],
    ['an ordered item holding only a comment', doc('::: note', '1. %% c', FENCE, 'code', '::::', ':::', 'after *b*'), ['::::'], [':::']],
    ['a comment item that continues a paragraph opens no fence', doc('::: note', 'para', '- %% c', FENCE, 'code', '::::', ':::', 'after *b*'), [], ['::::', ':::']],
];

const isCode = { prism: /code-block/, highlightjs: /^code$/ };

/** The scopes of the bare colon lines after the fence, in order. */
async function colonLinesAfterFence(tokenize, source) {
    const fenceAt = source.indexOf(FENCE);
    const scopes = [];
    let offset = 0;
    for (const token of await tokenize(source)) {
        const start = offset;
        offset += token.text.length;
        if (start <= fenceAt) continue;
        for (const part of token.text.split('\n')) {
            if (/^:{3,}$/.test(part)) scopes.push([part, token.scope ?? '']);
        }
    }
    return scopes;
}

for (const [name, source, code, delimiters] of rows) {
    for (const [surface, tokenize] of [['prism', prismTokens], ['highlightjs', hljsTokens]]) {
        const lines = await colonLinesAfterFence(tokenize, source);
        const expected = [...code.map((run) => [run, true]), ...delimiters.map((run) => [run, false])];
        assert.deepEqual(
            lines.map(([run, scope]) => [run, isCode[surface].test(scope)]),
            expected,
            `${surface}, ${name}: ${JSON.stringify(lines)}`,
        );
    }
    console.log(`  ✓ ${name}`);
}
