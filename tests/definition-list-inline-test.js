import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// A term and a description body are inline runs, and the list ends where carve-js ends it,
// so the paragraph after a blank line highlights as any paragraph does.
assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const engines = [
    ['textmate', await textmateTokenizer(grammar)],
    ['textmate-lines', await textmateLineTokenizer(grammar)],
    ['prism', prismTokens],
    ['highlightjs', hljsTokens],
];
const STRONG = /bold|strong/;
const MARKER = /punctuation|title/;

// The scope of the token that covers `source.indexOf(needle, from)`.
function scopeOf(tokens, source, needle, from = 0) {
    const start = source.indexOf(needle, from);
    assert.ok(start >= 0, `${JSON.stringify(needle)} not in ${JSON.stringify(source)}`);
    let offset = 0;
    for (const token of tokens) {
        if (start >= offset && start < offset + token.text.length) return token.scope ?? '';
        offset += token.text.length;
    }
    assert.fail(`no token covers offset ${start}`);
}

// [source, needle, search start, expected scope, rendered by carve-js as]
const cases = [
    [':: term\n: def *b*\n\nx *c* end\n', 'b', 12, STRONG, 'strong inside the dd'],
    [':: term\n: def *b*\n\nx *c* end\n', 'c', 0, STRONG, 'strong in the paragraph after the list'],
    [':: t *b*\n: d\n', 'b', 0, STRONG, 'strong inside the dt'],
    [':: a\nlazy *b*\n: d\n', 'b', 0, STRONG, 'strong in the folded dt line'],
    [':: a\n: d\nlazy *b*\n', 'b', 0, STRONG, 'strong in the lazy dd line'],
    [':: a\n: d\n\n  more *b*\n', 'b', 0, STRONG, 'strong in the second dd paragraph'],
    [':: a\n: x\n\n:: b\n: y *c*\n', 'c', 0, STRONG, 'strong in the second entry'],
    [':: a\n: x\n\n:: b\n: y\n', '::', 1, MARKER, 'a second entry after a blank line'],
    [':: a\n\n: d\n', ':', 3, MARKER, 'a dd one blank line below its term'],
    [':: a\n: +\n> q *b*\n', '+', 0, /punctuation/, 'the continuation marker'],
    [':: a\n:  d\n\n   more\n: y\n', ': y', 0, MARKER, 'a dd after a line at the content column'],
];
for (const [name, tokenize] of engines) {
    for (const [source, needle, from, scope, why] of cases) {
        const tokens = tokenize(source);
        assert.equal(tokens.map(t => t.text).join(''), source);
        assert.match(scopeOf(tokens, source, needle, from), scope, `${name}: ${why} in ${JSON.stringify(source)}`);
    }
    // carve-js renders `<p>para\n: y</p>`: the list has ended, so this `:` is prose. In the
    // second, `more` is short of the three-column content column.
    for (const after of [':: a\n: x\n\npara\n: y\n', ':: a\n:  d\n\n  more\n: y\n']) {
        const tokens = tokenize(after);
        assert.doesNotMatch(scopeOf(tokens, after, ': y'), MARKER, `${name}: the list ran past ${JSON.stringify(after)}`);
    }
}
console.log('Definition lists: term and description are inline runs, and the list ends at its paragraph.');
