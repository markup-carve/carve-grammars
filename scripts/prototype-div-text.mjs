import { readFileSync, writeFileSync } from 'node:fs';

const source = 'textmate/carve.tmLanguage.json';
const grammar = JSON.parse(readFileSync(source, 'utf8'));
const guard = '^(?![ \\t]*:{3,} +(?:\\*[ \\t]*$|"(?:\\\\.|[^"\\\\])*"[ \\t]*$))';
for (const key of ['admonition', 'admonition_in_group', 'admonition_in_list', 'admonition_in_group_in_list']) {
    const rule = grammar.repository[key];
    rule.begin = guard + rule.begin.slice(1);
}
writeFileSync(source, `${JSON.stringify(grammar, null, 2)}\n`);
