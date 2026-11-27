import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

for (const [name, source] of [
    ['unknown language', '{.diff}\n```foo\n+added\n-removed\n```\n'],
    ['embedded JavaScript', '{.diff}\n```js\n+added\n-removed\n```\n'],
    ['nested Carve div', '{.diff}\n```carve\n::: note\n+added\n-removed\n:::\n```\n'],
]) {
    const tokens = tokenize(source);
    const inserted = tokens.find(({ text }) => text === '+');
    const deleted = tokens.find(({ text }) => text === '-');
    assert.ok(inserted?.scope.includes('markup.inserted.diff.carve'), `${name}: added line marker`);
    assert.ok(deleted?.scope.includes('markup.deleted.diff.carve'), `${name}: removed line marker`);
}

for (const token of tokenize('+outside\n-outside\n')) {
    assert.ok(!token.scope.includes('markup.inserted.diff.carve'));
    assert.ok(!token.scope.includes('markup.deleted.diff.carve'));
}

console.log('TextMate diff scopes: marker scopes stay inside diff fences');
