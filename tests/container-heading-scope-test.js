import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const engines = [
    ['textmate', await textmateTokenizer(grammar)],
    ['textmate-lines', await textmateLineTokenizer(grammar)],
];
function scopesAt(tokens, source, text) {
    const start = source.indexOf(text);
    assert.ok(start >= 0, text);
    let offset = 0;
    const scopes = tokens.filter(token => {
        const next = offset + token.text.length;
        const overlaps = offset < start + text.length && next > start;
        offset = next;
        return overlaps;
    }).map(token => token.scope ?? '');
    assert.ok(scopes.length > 0, text);
    return scopes;
}
for (const [name, tokenize] of engines) {
    for (const [marker, indent] of [['- ', '  '], ['- [x] ', '  '], ['1. ', '   ']]) {
        for (const kind of ['note', 'figure']) {
            const source = `${marker}::: ${kind}\n${indent}# Heading\n${indent}::: \n\nAfter.\n\n  # Outside\n`;
            const tokens = tokenize(source);
            assert.equal(tokens.map(t => t.text).join(''), source);
            assert.ok(scopesAt(tokens, source, 'Heading').every(scope => /markup.heading/.test(scope)), `${name}: ${marker}${kind}`);
            assert.ok(scopesAt(tokens, source, 'Outside').every(scope => !/markup.heading|admonition|figure-group/.test(scope)), `${name}: outside`);
        }
    }
    const nested = '::: figure\n::: note\n  # Nested\n:::\n:::\n';
    assert.ok(scopesAt(tokenize(nested), nested, 'Nested').every(scope => !/markup.heading/.test(scope)), `${name}: top-level indented heading stays literal`);
}
console.log('Container headings: indented headings retain scopes and document-level indentation stays literal.');
