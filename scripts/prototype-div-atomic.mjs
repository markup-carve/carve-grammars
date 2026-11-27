import { readFileSync, writeFileSync } from 'node:fs';

const path = 'textmate/carve.tmLanguage.json';
const grammar = JSON.parse(readFileSync(path, 'utf8'));
const names = [
    'admonition', 'admonition_in_group', 'admonition_on_marker_line',
    'admonition_in_list', 'admonition_in_group_in_list',
    'figure_group', 'figure_group_on_marker_line', 'figure_group_in_list',
];
for (const name of names) {
    const rule = grammar.repository[name];
    rule.begin = rule.begin.replaceAll('[^\\r\\n]*', '[^\\r\\n]*+').replaceAll('[ \\t]*$', '[ \\t]*+$');
    rule.end = rule.end.replaceAll('[ \\t]*', '[ \\t]*+');
}
writeFileSync(path, `${JSON.stringify(grammar, null, 2)}\n`);
