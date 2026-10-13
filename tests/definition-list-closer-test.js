import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// The block opener that closes a definition list keeps its own scopes (carve-grammars#682).
assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const engines = [
    ['textmate', await textmateTokenizer(grammar)],
    ['textmate-lines', await textmateLineTokenizer(grammar)],
];

function scopeAt(tokens, start) {
    let offset = 0;
    for (const token of tokens) {
        if (offset === start) return token.scope ?? '';
        offset += token.text.length;
    }
    assert.fail(`no token starts at offset ${start}`);
}

// Lists need the blank line (a marker does not interrupt the description); headings and quotes do not.
const cases = [
    ['- after', /punctuation\.definition\.list\.unnumbered/, ['\n\n']],
    ['1. after', /punctuation\.definition\.list\.numbered/, ['\n\n']],
    ['## after', /punctuation\.definition\.heading/, ['\n\n', '\n']],
    ['> after', /punctuation\.definition\.quote/, ['\n\n', '\n']],
];
for (const [name, tokenize] of engines) {
    for (const [block, scope, gaps] of cases) {
        for (const gap of gaps) {
            const source = `:: term\n: definition${gap}${block}\n`;
            const tokens = tokenize(source);
            assert.equal(tokens.map(t => t.text).join(''), source);
            assert.match(scopeAt(tokens, source.lastIndexOf(block)), scope, `${name}: ${JSON.stringify(source)}`);
        }
    }
}
console.log('Definition list closers: the closing block opener keeps its scopes.');
