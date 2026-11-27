import { readFileSync, writeFileSync } from 'node:fs';

const source = 'textmate/carve.tmLanguage.json';
const grammar = JSON.parse(readFileSync(source, 'utf8'));
const divRules = [
    'admonition', 'admonition_in_group', 'admonition_on_marker_line',
    'admonition_in_list', 'admonition_in_group_in_list',
    'figure_group', 'figure_group_on_marker_line', 'figure_group_in_list',
];
const depth = Number(process.argv[2]);
if (!Number.isInteger(depth) || depth < 1) throw new Error('Pass a positive depth cap');

const originals = Object.fromEntries(divRules.map((key) => [key, grammar.repository[key]]));
for (let level = 1; level <= depth; level++) {
    for (const key of divRules) {
        const rule = structuredClone(originals[key]);
        const rewrite = (value) => {
            if (Array.isArray(value)) {
                for (let index = value.length - 1; index >= 0; index--) {
                    if (value[index]?.include && divRules.includes(value[index].include.slice(1))) {
                        if (level === depth) {
                            value.splice(index, 1);
                            continue;
                        }
                        value[index].include += `_depth_${level + 1}`;
                    }
                    rewrite(value[index]);
                }
            } else if (value && typeof value === 'object') {
                for (const child of Object.values(value)) rewrite(child);
            }
        };
        rewrite(rule.patterns);
        grammar.repository[level === 1 ? key : `${key}_depth_${level}`] = rule;
    }
}
writeFileSync(source, `${JSON.stringify(grammar, null, 2)}\n`);
