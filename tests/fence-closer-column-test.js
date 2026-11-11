// A code fence closes at or left of its opener's column; a tab-indented run can reach past it.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
// Whether `*a*` after the closer line is bold: it is when the fence closed there.
const boldAfter = {
    prism: (s) => prismTokens(s).some((t) => t.text === '*a*' && /bold/.test(t.scope ?? '')),
    highlightjs: (s) => hljsTokens(s).some((t) => t.text === '*a*' && t.scope === 'strong'),
    textmate: (s) => textmate(s).some((t) => t.text.includes('a') && (t.scope ?? '').includes('markup.bold')),
};
const ROWS = [
    [' ```\nx\n```\n*a*\n```\n', true],
    ['  ```\nx\n ```\n*a*\n```\n', true],
    ['\t```\nx\n\t```\n*a*\n```\n', true],
    ['```\nx\n ```\n*a*\n```\n', false],
    ['  ```\nx\n\t```\n*a*\n```\n', false],
];
for (const [source, closes] of ROWS) {
    assert.equal(carveToHtml(source).includes('<strong>a</strong>'), closes, `engine: ${JSON.stringify(source)}`);
    for (const [name, bold] of Object.entries(boldAfter)) assert.equal(bold(source), closes, `${name}: ${JSON.stringify(source)}`);
}
console.log(`fence closer column: ${ROWS.length} shapes agree with carve-js in all three grammars`);
