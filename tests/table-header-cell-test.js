import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// A header cell's text carries a bold scope up to its own separator (carve-grammars#685).
assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const tokenize = await textmateLineTokenizer(grammar);
const HEADER = 'markup.bold.table.header.carve';

const leaves = (source) => tokenize(source).filter((leaf) => leaf.text.trim());
const scopeOf = (source, text) => leaves(source).find((leaf) => leaf.text.trim() === text)?.scope ?? '';

for (const [source, header, body] of [
    ['|= Name |= Age |\n| Ann | 3 |\n', ['Name', 'Age'], ['Ann', '3']],
    ['|=< Left | plain |\n', ['Left'], ['plain']],
    ['|= a \\| b | c |\n', ['a', 'b'], ['c']],
]) {
    for (const text of header) assert.ok(scopeOf(source, text).includes(HEADER), `${JSON.stringify(source)}: ${text}`);
    for (const text of body) assert.ok(!scopeOf(source, text).includes(HEADER), `${JSON.stringify(source)}: ${text}`);
}

const escaped = leaves('|= a \\| b | c |\n');
assert.ok(escaped.some((leaf) => leaf.text === '\\|' && leaf.scope.includes('constant.character.escape')), 'an escaped pipe stays in the cell');
const marker = leaves('|= Name |\n').find((leaf) => leaf.text === '|=');
assert.ok(marker.scope.includes('keyword.operator.table.header.carve') && !marker.scope.includes(HEADER), 'the marker is not cell text');
console.log('Table header cells: the text is bold up to the cell separator.');
