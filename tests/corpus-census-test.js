import assert from 'node:assert/strict';
import { declaredPairsIn } from './lib/corpus.js';

// One compare block may hold several pairs, and a fence's content is never markup.
const page = [
    '::: compare',
    '',
    '```carve',
    'a',
    '```',
    '',
    '```html',
    '<p>a</p>',
    '```',
    '',
    '```carve',
    'b',
    '```',
    '',
    '```html',
    '<p>b</p>',
    '```',
    '',
    '````carve',
    '```carve',
    'c',
    '```',
    '````',
    '',
    '````html',
    '<pre><code class="language-carve">c</code></pre>',
    '````',
    '',
    ':::',
    '',
    '````text',
    '::: compare',
    '```carve',
    'not a pair',
    '```',
    ':::',
    '````',
    '',
].join('\n');

assert.equal(declaredPairsIn(page), 3);
console.log('Corpus census: a three-pair compare block counts three pairs.');
