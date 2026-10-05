import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const current = Prism.languages.carve;
const previous = /(?<=^(?<![^\r\n])[ \t]*\|[^\n]*?)([ \t])%{2,}(?:\\.|[^\\|\r\n])*?(?=[ \t]*(?:\||$(?![^\r\n])))/m;
const rule = current.comment.find(r => r.pattern.source.includes('%{2,}') && r.pattern.source.includes('(?<=^'));
assert.ok(rule, 'table-cell comment rule must be exercised');
assert.ok(rule.pattern.source.indexOf('%{2,}') < rule.pattern.source.indexOf('(?<=^'),
    'check the comment opener before scanning the row prefix');
const reference = { ...current, comment: current.comment.map(r => r === rule ? { ...r, pattern: previous } : r) };
const alphabet = [' ', '\t', '%', '|', '\\', 'x', '\r', '\u2028', '\u2029'];
let comparisons = 0;
function check(body, terminator = '\n') {
    for (const prefix of ['', '| a', ' | a', '> | a', '\n| a']) {
        const source = `${prefix} ${body} | b |${terminator}`;
        assert.deepEqual(Prism.tokenize(source, current), Prism.tokenize(source, reference), source);
        comparisons++;
    }
}
function generate(body, depth) {
    check(body);
    if (depth) for (const character of alphabet) generate(body + character, depth - 1);
}
generate('', 4);
for (const spaces of [' ', '\t', ' \t '.repeat(8)]) {
    for (const ending of ['h', '|', '', '\\|']) check(`%% ${spaces}${ending}`);
}
check('%% h', '\r');
check('%% h', '\r\n');
console.log(`Table comment prefix: ${comparisons} token streams retain their scopes.`);
