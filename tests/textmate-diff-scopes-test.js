import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

for (const language of ['foo', 'carve']) {
    const source = `{.diff}\n\`\`\`${language}\n+added\n-removed\n\`\`\`\n`;
    const tokens = tokenize(source);
    const inserted = tokens.find(({ text }) => text === '+');
    const deleted = tokens.find(({ text }) => text === '-');
    assert.ok(inserted?.scope.includes('markup.inserted.diff.carve'), `${language}: added line marker`);
    assert.ok(deleted?.scope.includes('markup.deleted.diff.carve'), `${language}: removed line marker`);
}

for (const token of tokenize('+outside\n-outside\n')) {
    assert.ok(!token.scope.includes('markup.inserted.diff.carve'));
    assert.ok(!token.scope.includes('markup.deleted.diff.carve'));
}

console.log('TextMate diff scopes: marker scopes stay inside diff fences');
