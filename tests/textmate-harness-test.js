import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { textmateTokenizer } from './lib/textmate-engine.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenize = await textmateTokenizer(resolve(repoRoot, 'textmate/carve.tmLanguage.json'));

const BOLD = 'markup.bold.carve';
const covered = (source) => tokenize(source)
    .filter((leaf) => leaf.scope.split(' ').includes(BOLD))
    .map((leaf) => leaf.text)
    .join('');

for (const source of ['a *b c\n\nnext paragraph', 'a *b c\n \t\nnext paragraph']) {
    assert.equal(tokenize(source).map((leaf) => leaf.text).join(''), source);
    assert.equal(covered(source), 'b c');
}

assert.doesNotThrow(() => tokenize('a *b\nc* d'));
assert.doesNotThrow(() => tokenize('a *b* c\n'));
assert.deepEqual(tokenize(''), []);

console.log('textmate harness: blank lines reach the TextMate state machine');
