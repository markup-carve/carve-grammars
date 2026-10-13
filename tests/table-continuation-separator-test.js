import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// A table continuation row scopes its separators like any other row (carve-grammars#684).
assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
// The line tokenizer keeps one leaf per token, which is what counting separators needs.
const engines = [['textmate-lines', await textmateLineTokenizer(grammar)]];

for (const [name, tokenize] of engines) {
    for (const row of ['+ and more |     |     |', '+ *bold* more | x |']) {
        const source = `| some content | foo | bar |\n${row}\n`;
        const tokens = tokenize(source);
        assert.equal(tokens.map(t => t.text).join(''), source);
        let offset = 0;
        const start = source.indexOf(row);
        const pipes = [];
        let bold = false;
        for (const token of tokens) {
            if (offset >= start && offset < start + row.length) {
                if (token.text === '|') pipes.push(token.scope ?? '');
                if (token.text.includes('bold') && /strong|bold/.test(token.scope ?? '')) bold = true;
            }
            offset += token.text.length;
        }
        assert.equal(pipes.length, row.split('|').length - 1, `${name}: ${row}`);
        assert.ok(pipes.every(scope => scope.includes('punctuation.separator.table')), `${name}: ${row}`);
        if (row.includes('*bold*')) assert.ok(bold, `${name}: inline formatting in ${row}`);
    }
}
console.log('Table continuation rows: separators and inline formatting keep their scopes.');
