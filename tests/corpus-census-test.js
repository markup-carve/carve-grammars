import assert from 'node:assert/strict';
import { collectInputsIn, declaredPairsIn } from './lib/corpus.js';

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

// carve#5244: the generator writes one fixture per distinct input after its
// modifiers, so a repeated input is one document and a crlf copy is another.
const dupes = [
    '::: compare',
    '```carve',
    'a',
    '```',
    '```html',
    '<p>a</p>',
    '```',
    ':::',
    '',
    '::: compare',
    '```carve',
    'a',
    '```',
    '```html',
    '<p>a</p>',
    '```',
    ':::',
    '',
    '::: compare crlf',
    '```carve',
    'a',
    '```',
    '```html',
    '<p>a</p>',
    '```',
    ':::',
    '',
].join('\n');
const inputs = new Set();
assert.equal(collectInputsIn(dupes, inputs), 3);
assert.deepEqual([...inputs], ['a\n', 'a\r\n']);
console.log('Corpus census: a three-pair compare block counts three pairs, a repeated input one document.');
