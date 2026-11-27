import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const source = 'textmate/carve.tmLanguage.json';
const base = execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { encoding: 'utf8' }).trim();
const grammar = JSON.parse(execFileSync('git', ['show', `${base}:${source}`], { encoding: 'utf8', maxBuffer: 16 << 20 }));
const divRules = [
    'admonition', 'admonition_in_group', 'admonition_on_marker_line',
    'admonition_in_list', 'admonition_in_group_in_list',
    'figure_group', 'figure_group_on_marker_line', 'figure_group_in_list',
];
const depth = Number(process.argv[2]);
if (!Number.isInteger(depth) || depth < 1) throw new Error('Pass a positive depth cap');

const references = (value, result = new Set()) => {
    if (Array.isArray(value)) {
        for (const item of value) references(item, result);
    } else if (value && typeof value === 'object') {
        if (typeof value.include === 'string' && value.include.startsWith('#')) result.add(value.include.slice(1));
        for (const item of Object.values(value)) references(item, result);
    }
    return result;
};
const affected = new Set(divRules);
let previousSize;
do {
    previousSize = affected.size;
    for (const [key, rule] of Object.entries(grammar.repository)) {
        if ([...references(rule)].some((target) => affected.has(target))) affected.add(key);
    }
} while (affected.size !== previousSize);
const originals = Object.fromEntries([...affected].map((key) => [key, grammar.repository[key]]));
for (let level = 1; level <= depth; level++) {
    for (const key of affected) {
        const rule = structuredClone(originals[key]);
        const rewrite = (value) => {
            if (Array.isArray(value)) {
                for (let index = value.length - 1; index >= 0; index--) {
                    const target = value[index]?.include?.slice(1);
                    if (target && affected.has(target)) {
                        if (divRules.includes(target) && level === depth) {
                            value.splice(index, 1);
                            continue;
                        }
                        const targetLevel = divRules.includes(target) ? level + 1 : level;
                        value[index].include = `#${target}_depth_${targetLevel}`;
                    }
                    rewrite(value[index]);
                }
            } else if (value && typeof value === 'object') {
                for (const child of Object.values(value)) rewrite(child);
            }
        };
        rewrite(rule);
        grammar.repository[divRules.includes(key) && level === 1 ? key : `${key}_depth_${level}`] = rule;
    }
}
writeFileSync(source, `${JSON.stringify(grammar, null, 2)}\n`);
