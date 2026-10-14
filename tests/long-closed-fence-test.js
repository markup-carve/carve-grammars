/**
 * A closed code fence of any length ends at its closer, and an unclosed one
 * still runs to its container's end. highlight.js looks a bounded distance
 * ahead for the closer, so a longer block reached its unclosed fallback and
 * painted everything after the real closer as code.
 */
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { textmateEngines } from './lib/surface-engines.js';

assertThisFileRuns(import.meta.url);

const FENCE = '`'.repeat(3);
const surfaces = [
    ['prism', prismTokens],
    ['highlightjs', hljsTokens],
    ...await textmateEngines(),
];
const isCode = { prism: /code/, highlightjs: /code/, textmate: /fenced_code|raw/ };
const isBold = { prism: /bold/, highlightjs: /strong/, textmate: /markup\.bold/ };
const test = (table, name, scope) => (table[name] ?? table.textmate).test(scope ?? '');

/** The scopes of the token covering the first occurrence of `needle` at or after `from`. */
async function scopeAt(tokenize, source, needle, from = 0) {
    const at = source.indexOf(needle, from);
    assert.ok(at >= 0, `${JSON.stringify(needle)} is in the source`);
    let offset = 0;
    const token = (await tokenize(source)).find((t) => (offset += t.text.length) > at);
    return [token.scope, ...(token.ancestors ?? [])].join(' ');
}

const body = (bytes) => 'payload line\n'.repeat(Math.ceil(bytes / 13));
const closed = [];
for (const kb of [40, 200]) {
    closed.push([`a ${kb} KB fence`, `${FENCE}\n${body(kb * 1024)}${FENCE}\n\n*after*\n`]);
    closed.push([`a ${kb} KB fence closed by a longer run`, `${FENCE}\n${body(kb * 1024)}${FENCE}\`\n\n*after*\n`]);
    closed.push([`a ${kb} KB fence holding a shorter run`, `${FENCE}\`\n${body(kb * 1024)}${FENCE}\n*inside*\n${FENCE}\`\n\n*after*\n`]);
    closed.push([`a ${kb} KB fence before another fence`, `${FENCE}\n${body(kb * 1024)}${FENCE}\n\n*after*\n\n${FENCE}\nx\n${FENCE}\n`]);
    closed.push([`a ${kb} KB fence in a div`, `::: note\n${FENCE}\n${body(kb * 1024)}${FENCE}\n\n*after*\n:::\n`]);
}

for (const [label, source] of closed) {
    const rendered = carveToHtml(source);
    assert.match(rendered, /<strong>after<\/strong>/, `${label}: the engine closes the fence`);
    const inside = source.includes('*inside*');
    if (inside) assert.doesNotMatch(rendered, /<strong>inside<\/strong>/, `${label}: the shorter run is payload`);
    for (const [name, tokenize] of surfaces) {
        const after = await scopeAt(tokenize, source, 'after*');
        assert.ok(!test(isCode, name, after), `${name}: ${label}: text after the closer is not code (${after})`);
        assert.ok(test(isBold, name, after), `${name}: ${label}: text after the closer is bold (${after})`);
        assert.ok(test(isCode, name, await scopeAt(tokenize, source, 'payload')), `${name}: ${label}: the payload is code`);
        if (inside) {
            const scope = await scopeAt(tokenize, source, '*inside*');
            assert.ok(test(isCode, name, scope), `${name}: ${label}: the shorter run does not close it (${scope})`);
        }
    }
}

// Unclosed at column 0, the fence still takes the rest of the document.
const unclosed = `${FENCE}\n${body(40 * 1024)}\n*after*\n`;
assert.doesNotMatch(carveToHtml(unclosed), /<strong>/, 'the engine reads an unclosed fence to the end');
for (const [name, tokenize] of [['prism', prismTokens], ['highlightjs', hljsTokens]]) {
    const scope = await scopeAt(tokenize, unclosed, 'after*');
    assert.ok(test(isCode, name, scope), `${name}: an unclosed 40 KB fence runs to the end (${scope})`);
}

console.log(`  ✓ a closed fence past 32 KB ends at its closer on ${surfaces.length} surfaces`);
