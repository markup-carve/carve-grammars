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

// A marker glued to the pipe and followed by a space is an alignment run even
// when the cell is empty; a span marker stands alone between spaces or pipes.
assert.match(carveToHtml('| a | b |\n| x |< |'), /<td style="text-align: left;"><\/td>/);
assert.equal(covered(tokenize, '| a | b |\n| x |< |', alignment), '<');
assert.equal(covered(tokenize, '| a | b |\n| x |< |', colspan), '');

for (const source of ['| a | b |\n| x |<|', '| a | b |\n| x | < |']) {
    assert.match(carveToHtml(source), /colspan="2"/, source);
    assert.equal(covered(tokenize, source, colspan), '<', source);
    assert.equal(covered(tokenize, source, alignment), '', source);
}

console.log('TextMate table alignment and colspan scopes: 7 cases passed');
