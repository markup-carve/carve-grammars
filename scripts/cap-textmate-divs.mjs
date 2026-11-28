/**
 * Bound TextMate div frames without copying the unrelated grammar body.
 *
 * The original rules live under _div_source_ keys in the generated grammar.
 * Run this script again after editing those source rules. Public names remain
 * entry points; only rules that can reach a div get depth-indexed variants.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'textmate/carve.tmLanguage.json';
const original = readFileSync(path, 'utf8');
const grammar = JSON.parse(original);
const limit = 64;
const divs = new Set([
    'admonition', 'admonition_in_group', 'admonition_on_marker_line',
    'admonition_in_list', 'admonition_in_group_in_list',
    'figure_group', 'figure_group_on_marker_line', 'figure_group_in_list',
]);
const sourcePrefix = '_div_source_';
const depthPrefix = '_div_depth_';
const sharedPrefix = '_div_shared_';
const repository = grammar.repository;
const source = Object.fromEntries(Object.entries(repository)
    .filter(([key]) => key.startsWith(sourcePrefix))
    .map(([key, rule]) => [key.slice(sourcePrefix.length), rule]));

// The first run moves source rules aside. Later runs use those rules only.
if (Object.keys(source).length === 0) {
    const references = (rule) => [...JSON.stringify(rule).matchAll(/"include":"#([^"]+)"/g)]
        .map((match) => match[1]);
    const reachable = new Set(divs);
    let changed = true;
    while (changed) {
        changed = false;
        for (const [key, rule] of Object.entries(repository)) {
            if (!reachable.has(key) && references(rule).some((ref) => reachable.has(ref))) {
                reachable.add(key);
                changed = true;
            }
        }
    }
    for (const key of reachable) source[key] = structuredClone(repository[key]);
}

for (const key of Object.keys(repository)) {
    if (key.startsWith(sourcePrefix) || key.startsWith(depthPrefix) || key.startsWith(sharedPrefix)) {
        delete repository[key];
    }
}
const dynamic = new Set(Object.keys(source));
const shared = new Map();
const at = (key, depth) => depth === (divs.has(key) ? 1 : 0)
    ? key : `${depthPrefix}${depth}_${key}`;

function hasDynamic(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.include === 'string' && value.include.startsWith('#')
        && dynamic.has(value.include.slice(1))) return true;
    return Object.values(value).some(hasDynamic);
}

function share(patterns) {
    const signature = JSON.stringify(patterns);
    let name = shared.get(signature);
    if (!name) {
        name = `${sharedPrefix}${shared.size}`;
        shared.set(signature, name);
        repository[name] = { patterns };
    }
    return { include: `#${name}` };
}

function transform(value, depth) {
    if (Array.isArray(value)) {
        const result = [];
        let stable = [];
        const flush = () => {
            if (stable.length) result.push(share(stable));
            stable = [];
        };
        for (const item of value) {
            if (!hasDynamic(item)) {
                stable.push(item);
                continue;
            }
            flush();
            const next = transform(item, depth);
            if (next !== null) result.push(next);
        }
        flush();
        return result;
    }
    if (value && typeof value === 'object') {
        if (typeof value.include === 'string' && value.include.startsWith('#')) {
            const key = value.include.slice(1);
            if (dynamic.has(key)) {
                const nextDepth = depth + Number(divs.has(key));
                if (nextDepth > limit) return null;
                return { ...value, include: `#${at(key, nextDepth)}` };
            }
        }
        const result = {};
        for (const [key, child] of Object.entries(value)) {
            result[key] = hasDynamic(child) ? transform(child, depth) : child;
        }
        return result;
    }
    return value;
}

for (const [key, rule] of Object.entries(source)) {
    repository[`${sourcePrefix}${key}`] = rule;
    for (let depth = divs.has(key) ? 1 : 0; depth <= limit; depth++) {
        // A rule with nested div entries keeps its own opening scope, while
        // its child references point at the next depth on every path.
        const bounded = transform(rule, depth);
        if (divs.has(key) && depth === limit) {
            // TextMate checks the closing fence before body patterns. Once
            // the cap is reached, consume further openers as literal lines.
            bounded.patterns.unshift({ match: '^[ \\t]*:{3,}[^\\r\\n]*$' });
        }
        repository[at(key, depth)] = bounded;
    }
}

const generated = `${JSON.stringify(grammar, null, 2)}\n`;
if (process.argv.includes('--check')) {
    if (generated !== original) throw new Error(`${path} is not current; run node scripts/cap-textmate-divs.mjs`);
} else {
    writeFileSync(path, generated);
}
console.log(`TextMate div cap ${limit}: ${Object.keys(source).length} source rules, ${shared.size} shared body segments, ${Buffer.byteLength(generated)} bytes`);
