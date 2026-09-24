import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carveToHtml } from '@markup-carve/carve';
import { textmateLineTokenizer, covered } from './lib/textmate-lines.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenize = await textmateLineTokenizer(resolve(root, 'textmate/carve.tmLanguage.json'));
const alignment = 'keyword.operator.table.alignment.carve';
const colspan = 'keyword.operator.table.colspan.carve';

for (const [source, marker] of [
    ['|=> Category |= Item |', '>'],
    ['|=?^ Heading |= Other |', '?^'],
    ['|?v Value | Other |', '?v'],
    ['| a |< span |', '<'],
]) {
    assert.equal(covered(tokenize, source, alignment), marker, source);
}

for (const source of ['| a | b |\n| x |< |', '| a | b |\n| x | < |']) {
    assert.match(carveToHtml(source), /colspan="2"/, source);
    assert.equal(covered(tokenize, source, colspan), '<', source);
    assert.equal(covered(tokenize, source, alignment), '', source);
}

console.log('TextMate table alignment and colspan scopes: 6 cases passed');
