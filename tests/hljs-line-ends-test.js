import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import carve from '../highlightjs/carve.mjs';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);
const require = createRequire(import.meta.url);
const hljs = require('highlight.js');
hljs.registerLanguage('carve', carve);
const samples = [
    ['image caption', '![a](b.png)\n^ Abb'],
    ['table caption', '| a |\n|---|\n| b |\n^ Table'],
    ['bare quote', '>\n^ no caption'],
    ['definition term', ':: term\n: description'],
    ['quoted footnote', '[^n]:\n> :: term\n> : description'],
    ['comment before term', ':: outer\n: description\n%% comment\n  :: term'],
    ['list continuation', '- item\n  +\n  next'],
    ['description with paren', '> :: a\n> : x\n> : (b)'],
    ['nonquote prefix', '?> :: a\n> : b'],
    ['comment before lazy term', ':: outer\n: description\n%% comment\n :: term'],
];
const normalize = (value) => value.replace(/\r\n?|\n/g, '\n');
for (const [name, source] of samples) {
    const outputs = ['\n', '\r\n', '\r'].map((end) =>
        hljs.highlight(source.replaceAll('\n', end), { language: 'carve' }).value,
    );
    for (const output of outputs.slice(1)) assert.equal(normalize(output), normalize(outputs[0]), name);
    if (name === 'definition term') {
        assert.match(normalize(outputs[2]), /<span class="hljs-title">:: term<\/span>\n<span class="hljs-punctuation">:<\/span>/);
    }
    if (name === 'quoted footnote') {
        assert.match(outputs[2], /<span class="hljs-punctuation">:<\/span> description/);
    }
    if (name === 'nonquote prefix') assert.doesNotMatch(outputs[2], /hljs-punctuation/);
    if (name === 'image caption') {
        assert.match(outputs[2], /<span class="hljs-link">!\[a\]\(b\.png\)<\/span>/);
        assert.match(outputs[2], /<span class="hljs-caption"><span class="hljs-caption-marker">\^<\/span> Abb<\/span>/);
    }
}
console.log('highlight.js line ends: ten contexts agree across LF, CRLF, and CR.');
