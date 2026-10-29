import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { assertThisFileRuns } from './lib/runs-in-ci.js';

const require = createRequire(import.meta.url);
const Prism = require('prismjs');
await import('../prism/carve.js');

const samples = {
    'image caption': '![alt](/image.png)\n^ caption',
    'table caption': '| a |\n^ caption',
    'bare quote and caret': '>\n^ caption',
    'definition': ':: term\n: description',
    'quoted footnote definition': '[^n]:\n> :: term\n> : description',
    'comment before term': ':: outer\n: description\n%% comment\n  :: term',
    'list continuation': '- item\n  continuation',
    'description with paren': '> :: a\n> : x\n> : (b)',
    'nonquote prefix': '?> :: a\n> : b',
    'comment before lazy term': ':: outer\n: description\n%% comment\n :: term',
    'quoted include option': '{{ ch.crv @label:"a\nb" }}',
};

const normalize = value => {
    if (typeof value === 'string') return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    if (Array.isArray(value)) return value.map(normalize);
    return { type: value.type, content: normalize(value.content) };
};
const outer = { embedded: { pattern: /[\s\S]+/, inside: Prism.languages.carve } };

for (const [name, source] of Object.entries(samples)) {
    const expectedHighlight = normalize(Prism.highlight(source, Prism.languages.carve, 'carve'));
    const expectedTokens = normalize(Prism.tokenize(source, Prism.languages.carve));
    const expectedEmbedded = normalize(Prism.tokenize(source, outer));
    for (const lineEnd of ['\n', '\r\n', '\r']) {
        const input = source.replaceAll('\n', lineEnd);
        assert.deepEqual(normalize(Prism.highlight(input, Prism.languages.carve, 'carve')),
            expectedHighlight, `${name}: highlight ${JSON.stringify(lineEnd)}`);
        assert.deepEqual(normalize(Prism.tokenize(input, Prism.languages.carve)),
            expectedTokens, `${name}: tokenize ${JSON.stringify(lineEnd)}`);
        assert.deepEqual(normalize(Prism.tokenize(input, outer)),
            expectedEmbedded, `${name}: embedded ${JSON.stringify(lineEnd)}`);
    }
}

assert.match(Prism.highlight(':: term\r: description', Prism.languages.carve, 'carve'),
    /<span class="token punctuation">: <\/span>/);
assertThisFileRuns(import.meta.url);
