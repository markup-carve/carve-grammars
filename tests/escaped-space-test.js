// An escaped space is a non-breaking space (grammar.ebnf `escaped_space`); before a line end it is a hard break.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
const escaped = {
    prism: (s) => prismTokens(s).filter((t) => /escape/.test(t.scope ?? '')).map((t) => t.text),
    highlightjs: (s) => hljsTokens(s).filter((t) => t.scope === 'symbol').map((t) => t.text),
    textmate: (s) => textmate(s).filter((t) => (t.scope ?? '').includes('constant.character.escape.carve')).map((t) => t.text),
};

for (const source of ['10\\ kg\n', 'say\\ \'twas\n']) {
    assert.match(carveToHtml(source), /&nbsp;/, `engine: ${JSON.stringify(source)}`);
    for (const [name, read] of Object.entries(escaped)) assert.deepEqual(read(source), ['\\ '], `${name}: ${JSON.stringify(source)}`);
}
for (const source of ['a\\ \nb\n', 'a\\  \nb\n']) {
    assert.match(carveToHtml(source), /<br>/, `engine: ${JSON.stringify(source)}`);
    for (const [name, read] of Object.entries(escaped)) assert.deepEqual(read(source), [], `${name}: ${JSON.stringify(source)}`);
}
console.log('escaped space: scoped as an escape mid-line, left to the hard break before a line end');
