/**
 * An unclosed `{#` or `{%` inside a `*` run is text, so the run still closes at
 * its `*`; a closed comment stays opaque and wins over a `*` inside it
 * (carve-grammars#461). Every row was rendered through the executable grammar
 * at carve c091d01.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const surfaces = [
    ['prism', prismTokens, 'bold'],
    ['highlightjs', hljsTokens, 'strong'],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, 'markup.bold']),
];

// [source, text that is strong and not a comment, text that is a comment, text after the run]
// Prism and highlight.js leave a `{#` comment inside bold unscoped, so the
// closed `{#` row asks them only that the run holds.
const rows = [
    ['*a {# b* c', ' b', null, ' c'],
    ['*a {% b* c', ' b', null, ' c'],
    ['*a {# b* c #} d*', ' d', ' b* c ', null, (name) => !['prism', 'highlightjs'].includes(name)],
    ['*a {% b* c %} d*', ' d', ' b* c ', null],
];

const covering = (tokens, source, text) => {
    const at = source.indexOf(text);
    let offset = 0;
    return tokens.filter((t) => {
        const start = offset;
        offset += t.text.length;
        return start < at + text.length && at < offset && t.text.trim() !== '';
    });
};

let checked = 0;
for (const [name, tokenize, strong] of surfaces) {
    for (const [source, strongText, commentText, afterText, nests = () => true] of rows) {
        const tokens = await tokenize(`${source}\n`);
        const label = `${name}: ${JSON.stringify(source)}`;
        for (const t of covering(tokens, source, strongText)) {
            assert.ok(t.scope?.includes(strong), `${label} keeps ${JSON.stringify(t.text)} strong`);
            assert.ok(!t.scope.includes('comment'), `${label} does not comment ${JSON.stringify(t.text)}`);
        }
        if (commentText && nests(name)) {
            const inside = covering(tokens, source, commentText);
            assert.ok(inside.length && inside.every((t) => t.scope?.includes('comment')), `${label} comments ${JSON.stringify(commentText)}`);
        }
        if (afterText) {
            const after = covering(tokens, source, afterText);
            assert.ok(after.length && after.every((t) => !t.scope?.includes(strong) && !t.scope?.includes('comment')), `${label} ends the run before ${JSON.stringify(afterText)}`);
        }
        checked++;
    }
}

console.log(`comment in strong: ${checked} rows across ${surfaces.length} surfaces`);
