import assert from 'node:assert/strict';
import { createHighlighter as rawHighlighter } from 'shiki';
import { createHighlighter, retryTokenizer } from './lib/shiki.js';
import { carveGrammar } from '../shiki/index.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);
const options = { lang: 'carve', theme: 'github-light', includeExplanation: 'scopeName' };
const source = 'Text *bold* /italic/ end.';
const warnings = [];
let calls = 0;
const knownError = new TypeError("Cannot read properties of undefined (reading 'startIndex')");
knownError.stack += '\n at _tokenizeWithTheme (node_modules/@shikijs/primitive/dist/index.mjs:1:1)';
const retry = retryTokenizer(function (received) {
    assert.equal(received, options);
    assert.equal(this.marker, true);
    if (++calls === 1) throw knownError;
    return 'result';
}, message => warnings.push(message));
assert.equal(retry.call({ marker: true }, options), 'result');
assert.equal(calls, 2);
assert.equal(warnings.length, 1);
assert.match(warnings[0], /#607.*retrying once/);
for (const error of [new Error('other failure'), new TypeError(knownError.message)]) {
    let attempts = 0;
    assert.throws(() => retryTokenizer(() => { attempts++; throw error; }, () => assert.fail('unexpected warning'))(), e => e === error);
    assert.equal(attempts, 1);
}
let attempts = 0;
assert.throws(() => retryTokenizer(() => { attempts++; throw knownError; }, () => {})(), e => e === knownError);
assert.equal(attempts, 2);

function delayScopePass(highlighter) {
    const grammar = highlighter.getLanguage('carve');
    const tokenizeLine = grammar.tokenizeLine.bind(grammar);
    let delayed = false;
    grammar.tokenizeLine = (...args) => {
        if (delayed) return tokenizeLine(...args);
        delayed = true;
        const now = Date.now;
        let ticks = 0;
        Date.now = () => ticks++ * 1000;
        try { return tokenizeLine(...args); }
        finally { Date.now = now; }
    };
}
const raw = await rawHighlighter({ themes: ['github-light'], langs: [carveGrammar] });
delayScopePass(raw);
assert.throws(() => raw.codeToTokens(source, options), /reading 'startIndex'/);
raw.dispose();

for (const method of ['codeToTokens', 'codeToHtml']) {
    const highlighter = await createHighlighter({ themes: ['github-light'], langs: [carveGrammar] });
    const expected = highlighter[method](source, options);
    delayScopePass(highlighter);
    const warn = console.warn;
    const messages = [];
    console.warn = message => messages.push(message);
    try { assert.deepEqual(highlighter[method](source, options), expected); }
    finally { console.warn = warn; highlighter.dispose(); }
    assert.equal(messages.length, 1);
}
console.log('Shiki retry: delayed scope pass reproduces #607; one visible retry preserves the result');
