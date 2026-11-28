import assert from 'node:assert/strict';

import { textmateLineTokenizer, covered } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer('textmate/carve.tmLanguage.json');
const scope = 'meta.abbreviation.carve';
const definition = '*[HTML]: HyperText Markup Language';
const cases = [
    ['div', `::: note\n${definition}\n:::`, false],
    ['quote', `> ${definition}`, false],
    ['list item continuation', `- item\n  ${definition}`, false],
    ['description list item', `:: term\n: ${definition}`, false],
    ['top level', definition, true],
];

for (const [name, source, expected] of cases) {
    const actual = covered(tokenize, source, scope);
    assert.equal(actual !== '', expected, `${name}: ${JSON.stringify(source)} scoped ${JSON.stringify(actual)}; tokens ${JSON.stringify(tokenize(source))}`);
    console.log(`${name}: ${actual === '' ? 'plain text' : 'abbreviation definition'}`);
}
