import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// A quoted line's block markers scope as they do outside a quote (carve-grammars#683).
assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const textmate = await textmateLineTokenizer(grammar);

const EXPECT = {
    textmate: { bullet: /punctuation\.definition\.list\.unnumbered/, ordered: /punctuation\.definition\.list\.numbered/, task: /punctuation\.definition\.list\.unnumbered/, heading: /punctuation\.definition\.heading/ },
    prism: { bullet: /blockquote>list>punctuation/, ordered: /blockquote>list>punctuation/, task: /blockquote>list>punctuation/, heading: /blockquote>title/ },
    highlightjs: { bullet: /^bullet$/, ordered: /^bullet$/, task: /^bullet$/, heading: /^section$/ },
};
const engines = [['textmate', textmate], ['prism', prismTokens], ['highlightjs', hljsTokens]];

// The scope of the token holding `marker` at offset `at`.
function scopeAt(tokens, source, at) {
    let offset = 0;
    for (const token of tokens) {
        const text = token.text ?? '';
        if (at >= offset && at < offset + text.length) return token.scope ?? '';
        offset += text.length;
    }
    assert.fail(`no token at ${at} in ${JSON.stringify(source)}`);
}

for (const [name, tokenize] of engines) {
    for (const [kind, source, marker] of [
        ['bullet', '> - quoted\n', '-'],
        ['ordered', '> 1. quoted\n', '1'],
        ['task', '> - [x] quoted\n', '-'],
        ['heading', '> # quoted\n', '#'],
        ['bullet', '> > - nested\n', '-'],
        ['bullet', '> -{#x} glued\n', '-'],
        ['ordered', '> 1.{.c} glued\n', '1'],
    ]) {
        const tokens = tokenize(source);
        assert.equal(tokens.map(t => t.text).join(''), source, `${name}: projection`);
        assert.match(scopeAt(tokens, source, source.indexOf(marker)), EXPECT[name][kind], `${name}: ${kind} in ${JSON.stringify(source)}`);
    }
    // carve-js: a heading marker past the prefix column is prose (`>  # h` renders a paragraph).
    for (const source of ['>  # not a heading\n', '>     # not a heading\n']) {
        const tokens = tokenize(source);
        assert.doesNotMatch(scopeAt(tokens, source, source.indexOf('#')), EXPECT[name].heading, `${name}: literal ${JSON.stringify(source)}`);
    }
    for (const source of ['> a > - not a list\n', '> -\n', '> 1.\n']) {
        const tokens = tokenize(source);
        const at = source.lastIndexOf(source.includes('1.') ? '1' : '-');
        assert.doesNotMatch(scopeAt(tokens, source, at), EXPECT[name].bullet, `${name}: literal ${JSON.stringify(source)}`);
    }
}
console.log('Quote content: quoted list and heading markers scope in all three grammars.');
