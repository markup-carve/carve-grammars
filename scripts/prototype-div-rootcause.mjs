/**
 * Reproduce the TextMate div nesting cost in carve-grammars#1021.
 *
 * Run from the repository root after npm ci:
 *   node scripts/prototype-div-rootcause.mjs --isolate
 *   node scripts/prototype-div-rootcause.mjs --matrix
 *
 * Each row is process CPU milliseconds for one complete document pass.
 * The tag grammar comes from git so this script never edits a fixture or pin.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Registry, INITIAL } from '@shikijs/vscode-textmate';
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma';

const show = (revision) => JSON.parse(execFileSync('git', ['show', `${revision}:textmate/carve.tmLanguage.json`], {
    encoding: 'utf8',
    maxBuffer: 8 << 20,
}));
const tag = show('v0.1.24');
const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
const main = show(base);
const candidate = JSON.parse(readFileSync(resolve('textmate/carve.tmLanguage.json'), 'utf8'));
const engine = await createOnigurumaEngine(import('shiki/wasm'));
const openerRules = ['admonition', 'admonition_in_group', 'admonition_on_marker_line', 'admonition_in_list', 'admonition_in_group_in_list'];
const bodyRules = [...openerRules, 'figure_group', 'figure_group_on_marker_line', 'figure_group_in_list'];

function variant(kind) {
    if (kind === 'tag') return structuredClone(tag);
    if (kind === 'candidate') return structuredClone(candidate);
    if (kind === 'floor') return {
        scopeName: 'source.div-floor',
        patterns: [{ include: '#div' }],
        repository: { div: { begin: '^:::', end: '^;;;', name: 'meta.div', patterns: [{ include: '#div' }] } },
    };
    const grammar = structuredClone(main);
    if (kind === 'old-begin') {
        for (const key of openerRules) grammar.repository[key].begin = tag.repository[key].begin;
    } else if (kind === 'old-captures') {
        for (const key of openerRules) grammar.repository[key].beginCaptures = tag.repository[key].beginCaptures;
    } else if (kind === 'old-body') {
        for (const key of bodyRules) grammar.repository[key].patterns = structuredClone(tag.repository[key].patterns);
    } else if (kind === 'no-region') {
        for (const key of bodyRules) {
            grammar.repository[key].patterns = grammar.repository[key].patterns
                .filter((rule) => rule.include !== '#region_marker')
                .map((rule) => rule.patterns
                    ? { ...rule, patterns: rule.patterns.filter((nested) => nested.include !== '#region_marker') }
                    : rule);
        }
    } else if (kind === 'no-end-backref') {
        for (const key of openerRules) grammar.repository[key].end = grammar.repository[key].end.replace('\\1', ':{3,}');
    } else if (kind === 'simple-begin') {
        for (const key of openerRules) grammar.repository[key].begin = key === 'admonition_on_marker_line'
            ? '\\G(?<=[ \\t])(:{3,})(?: +([^\\r\\n]*))?[ \\t]*$'
            : '^(?:\\A\\x{FEFF})?[ \\t]*(:{3,})(?: +([^\\r\\n]*))?[ \\t]*$';
    }
    return grammar;
}

async function load(grammar) {
    const registry = new Registry({
        onigLib: {
            createOnigScanner: (sources) => engine.createScanner(sources),
            createOnigString: (source) => engine.createString(source),
        },
        loadGrammar: () => grammar,
    });
    const loaded = await registry.loadGrammar(grammar.scopeName);
    return (source) => {
        let state = INITIAL;
        for (const line of source.split('\n')) state = loaded.tokenizeLine2(line, state).ruleStack;
    };
}

function input(shape, size) {
    const unit = shape === 'anonymous' ? '::: *\n'
        : shape === 'titled' ? '::: "T"\n'
            : '::: note\ntext with *strong*\n::: \n';
    return unit.repeat(Math.max(1, Math.floor(size / Buffer.byteLength(unit))));
}

function cpuMs(tokenize, source) {
    const start = process.cpuUsage();
    tokenize(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

const isolate = process.argv.includes('--isolate');
const matrix = process.argv.includes('--matrix');
if (!isolate && !matrix) throw new Error('Pass --isolate or --matrix');
const kinds = isolate
    ? ['tag', 'main', 'old-begin', 'old-captures', 'old-body', 'no-region', 'no-end-backref', 'simple-begin']
    : ['tag', 'candidate', 'main', 'floor'];
const tokenizers = new Map();
for (const kind of kinds) tokenizers.set(kind, await load(variant(kind)));
for (const tokenize of tokenizers.values()) tokenize(input('anonymous', 512));
console.log('shape\tbytes\tvariant\tcpu_ms');
for (const size of (isolate ? [32768] : [2048, 8192, 32768, 131072])) {
    for (const shape of (isolate ? ['anonymous', 'titled'] : ['anonymous', 'titled', 'normal'])) {
        const source = input(shape, size);
        for (const kind of kinds) {
            const ms = cpuMs(tokenizers.get(kind), source);
            console.log(`${shape}\t${Buffer.byteLength(source)}\t${kind}\t${ms.toFixed(3)}`);
        }
    }
}
