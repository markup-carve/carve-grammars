/**
 * Reproduce the TextMate div measurements for carve-grammars#1021.
 *
 * Run from the repository root after npm ci:
 *   node scripts/prototype-div-rootcause.mjs --matrix
 *   node scripts/prototype-div-rootcause.mjs --isolate
 *   node scripts/prototype-div-rootcause.mjs --profile
 *
 * Optional --tag-file and --main-file paths avoid git calls in restricted
 * environments. The no-injection and old-begin variants change scopes and
 * serve only to isolate cost; they are not grammar fixes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { Registry, INITIAL } from '@shikijs/vscode-textmate';
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma';

const option = (name) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? null : process.argv[index + 1];
};
const show = (revision) => JSON.parse(execFileSync('git', ['show', `${revision}:textmate/carve.tmLanguage.json`], {
    encoding: 'utf8',
    maxBuffer: 8 << 20,
}));
const fromFile = (path) => JSON.parse(readFileSync(path, 'utf8'));
const tag = option('--tag-file') ? fromFile(option('--tag-file')) : show('v0.1.24');
const base = option('--main-file') ? null
    : execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
const main = option('--main-file') ? fromFile(option('--main-file')) : show(base);
const engine = await createOnigurumaEngine(import('shiki/wasm'));
const openerRules = ['admonition', 'admonition_in_group', 'admonition_on_marker_line', 'admonition_in_list', 'admonition_in_group_in_list'];
const bodyRules = [...openerRules, 'figure_group', 'figure_group_on_marker_line', 'figure_group_in_list'];

function variant(kind) {
    if (kind === 'tag') return structuredClone(tag);
    if (kind === 'floor') return {
        scopeName: 'source.div-floor',
        patterns: [{ include: '#div' }],
        repository: { div: { begin: '^:::', end: '^;;;', name: 'meta.div', patterns: [{ include: '#div' }] } },
    };
    const grammar = structuredClone(main);
    if (kind === 'no-injection') delete grammar.injections;
    else if (kind.startsWith('old-begin/')) {
        const key = kind.split('/')[1];
        grammar.repository[key].begin = tag.repository[key].begin;
    } else if (kind.startsWith('old-captures/')) {
        const key = kind.split('/')[1];
        grammar.repository[key].beginCaptures = tag.repository[key].beginCaptures;
    } else if (kind.startsWith('old-body/')) {
        const key = kind.split('/')[1];
        grammar.repository[key].patterns = structuredClone(tag.repository[key].patterns);
    } else if (kind === 'no-end-backref') {
        for (const key of openerRules) grammar.repository[key].end = grammar.repository[key].end.replace('\\1', ':{3,}');
    } else if (kind === 'simple-begin') {
        for (const key of openerRules) grammar.repository[key].begin = key === 'admonition_on_marker_line'
            ? '\\G(?<=[ \\t])(:{3,})(?: +([^\\r\\n]*))?[ \\t]*$'
            : '^(?:\\A\\x{FEFF})?[ \\t]*(:{3,})(?: +([^\\r\\n]*))?[ \\t]*$';
    }
    return grammar;
}

// Keep the two diagnostic controls honest when the JSON or JS escaping changes.
const withoutBackref = variant('no-end-backref').repository.admonition.end;
if (withoutBackref === main.repository.admonition.end || withoutBackref.includes(String.raw`\1`)) {
    throw new Error('The no-end-backref variant still has the div end backreference');
}
const simpleBegin = variant('simple-begin').repository.admonition.begin;
const simpleMarkerBegin = variant('simple-begin').repository.admonition_on_marker_line.begin;
if (!simpleBegin.includes(String.raw`\A`) || simpleBegin.includes(String.raw`\\A`)
    || !simpleMarkerBegin.startsWith(String.raw`\G`) || simpleMarkerBegin.startsWith(String.raw`\\G`)) {
    throw new Error('The simple-begin variant has an escaped anchor');
}

async function load(grammar, profile = false) {
    const stats = { searches: 0, scannerCpuUs: 0 };
    const registry = new Registry({
        onigLib: {
            createOnigScanner: (sources) => {
                const scanner = engine.createScanner(sources);
                if (!profile) return scanner;
                return {
                    findNextMatchSync(...args) {
                        const start = process.cpuUsage();
                        const result = scanner.findNextMatchSync(...args);
                        const elapsed = process.cpuUsage(start);
                        stats.searches++;
                        stats.scannerCpuUs += elapsed.user + elapsed.system;
                        return result;
                    },
                };
            },
            createOnigString: (source) => engine.createString(source),
        },
        loadGrammar: () => grammar,
    });
    const loaded = await registry.loadGrammar(grammar.scopeName);
    const tokenize = (source) => {
        let state = INITIAL;
        for (const line of source.split('\n')) state = loaded.tokenizeLine2(line, state).ruleStack;
    };
    return { tokenize, stats };
}

function input(shape, size) {
    const unit = shape === 'anonymous' ? '::: *\n'
        : shape === 'titled' ? '::: "T"\n'
            : '::: note\ntext with *strong*\n::: \n';
    return unit.repeat(Math.max(1, Math.floor(size / Buffer.byteLength(unit))));
}

function measure(runner, source) {
    runner.stats.searches = 0;
    runner.stats.scannerCpuUs = 0;
    const start = process.cpuUsage();
    runner.tokenize(source);
    const elapsed = process.cpuUsage(start);
    return {
        cpuMs: (elapsed.user + elapsed.system) / 1000,
        scannerMs: runner.stats.scannerCpuUs / 1000,
        searches: runner.stats.searches,
    };
}

const mode = ['--matrix', '--isolate', '--profile'].find((flag) => process.argv.includes(flag));
if (!mode) throw new Error('Pass --matrix, --isolate, or --profile');
const kinds = mode === '--matrix' ? ['tag', 'floor', 'main']
    : mode === '--profile' ? ['main', 'no-injection']
        : ['tag', 'main', ...openerRules.map((key) => `old-begin/${key}`),
            ...openerRules.map((key) => `old-captures/${key}`),
            ...bodyRules.map((key) => `old-body/${key}`), 'no-end-backref', 'simple-begin'];
const runners = new Map();
for (const kind of kinds) runners.set(kind, await load(variant(kind), mode === '--profile'));
for (const runner of runners.values()) runner.tokenize(input('anonymous', 512));
console.log('round\tshape\tbytes\tvariant\tcpu_ms\tscanner_ms\tsearches');
for (const round of mode === '--profile' ? [1] : [1, 2]) {
    for (const size of mode === '--matrix' ? [2048, 8192, 32768, 131072] : [32768]) {
        for (const shape of mode === '--matrix' ? ['anonymous', 'titled', 'normal'] : ['anonymous', 'titled']) {
            const source = input(shape, size);
            const order = round === 1 ? kinds : [...kinds].reverse();
            for (const kind of order) {
                const result = measure(runners.get(kind), source);
                console.log([round, shape, Buffer.byteLength(source), kind, result.cpuMs.toFixed(3),
                    result.scannerMs.toFixed(3), result.searches].join('\t'));
            }
        }
    }
}
