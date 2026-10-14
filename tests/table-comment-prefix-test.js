import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const current = Prism.languages.carve;
// The forms these rules had while each tested the line prefix per `%%` run: the
// cell rule at the document level, the continuation rule as one regex.
const previousRow = /([ \t])%{2,}(?<=^(?<![^\r\n])[ \t]*\|[^\n]*)(?:\\.|[^\\|\r\n \t]|[ \t]+(?![ \t]|\||$(?![^\r\n])))*(?=[ \t]*(?:\||$(?![^\r\n])))/m;
const previousContinuation = /((?<!^(?<![^\r\n])[ \t]*(?::{3,}(?: +[a-zA-Z0-9_][\w-]*)?|#{1,6}|[-*]|(?:[0-9]+|[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)]|\.)) |\t)%%(?!%)(?<!^(?<![^\r\n])[ \t]*(?:> )*(?:(?::{3,}(?: +[a-zA-Z0-9_][\w-]*)?|#{1,6}|[-*]|(?:[0-9]+|[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)]|\.)|\||\^)[^\n]*)[^\r\n]*$(?![^\r\n])/gm;
const cellRule = current.table.inside.comment.find((r) => r.pattern.source.includes('%{2,}'));
assert.ok(cellRule, 'the table row carries the cell comment rule');
assert.ok(!cellRule.pattern.source.includes('(?<=^'), 'a row needs no line-prefix test');
assert.ok(!current.comment.some((r) => r.pattern.source.includes('[ \\t]*\\|[^\\n]*)')),
    'no document-level comment rule tests the line prefix per run');
const continuation = current.comment.at(-1);
const reference = {
    ...current,
    comment: [
        ...current.comment.slice(0, -3),
        { pattern: previousRow, lookbehind: true, greedy: true },
        ...current.comment.slice(-3, -1),
        { ...continuation, pattern: previousContinuation },
    ],
    table: { ...current.table, inside: { ...current.table.inside, comment: current.table.inside.comment.map((r) => (r === cellRule ? { ...r, pattern: previousRow } : r)) } },
};
// A `|` line that is not a table row is a paragraph in the parser, so its
// comment now runs to the line end; those sources are counted, not compared.
const tableRow = current.table.pattern;
const plainPipeLine = (source) => source.split(/\r\n|\r|\n/).some((line) => /^[ \t]*\|/.test(line)
    && !new RegExp(tableRow.source).test(line));
let skipped = 0;
const alphabet = [' ', '\t', '%', '|', '\\', 'x', '\r', '\u2028', '\u2029'];
let comparisons = 0;
function check(body, terminator = '\n') {
    for (const prefix of ['', '| a', ' | a', '> | a', '\n| a']) {
        const source = `${prefix} ${body} | b |${terminator}`;
        if (plainPipeLine(source)) {
            skipped++;
            continue;
        }
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
assert.ok(comparisons > skipped, 'most sources are still compared');
console.log(`Table comment prefix: ${comparisons} token streams retain their scopes (${skipped} plain pipe lines skipped).`);
