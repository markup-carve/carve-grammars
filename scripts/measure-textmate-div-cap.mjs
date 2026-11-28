/** Tokenize one complete document per call for the div depth performance gate. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { Registry, INITIAL } from '@shikijs/vscode-textmate';
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma';

const [variant, shape, sizeText, repeatsText] = process.argv.slice(2);
const size = Number(sizeText);
const repeats = Number(repeatsText);
if (!['tag', 'current'].includes(variant) || !Number.isInteger(size) || !Number.isInteger(repeats)
    || size < 1 || repeats < 0) {
    throw new Error('Usage: node scripts/measure-textmate-div-cap.mjs tag|current anonymous|titled|demo|corpus|docs 2|8|32|128 repeats');
}
const tag = execFileSync('git', ['show', 'v0.1.24:textmate/carve.tmLanguage.json'], {
    encoding: 'utf8', maxBuffer: 8 << 20,
});
const grammar = JSON.parse(variant === 'tag' ? tag : readFileSync('textmate/carve.tmLanguage.json', 'utf8'));
const examples = JSON.parse(readFileSync('spec/spec/0.2/conformance/examples.json', 'utf8')).examples;
const bases = {
    anonymous: '::: *\n',
    titled: '::: "T"\n',
    demo: readFileSync('spec/docs/.vitepress/examples/demo.crv', 'utf8'),
    corpus: examples.filter((entry) => typeof entry.input === 'string').slice(0, 100)
        .map((entry) => `${entry.input}\n\n`).join(''),
    docs: readFileSync('spec/docs/examples.md', 'utf8'),
};
if (!bases[shape]) throw new Error(`Unknown shape ${shape}`);
const target = size * 1024;
const base = bases[shape];
const count = Math.max(1, Math.round(target / Buffer.byteLength(base)));
const source = base.repeat(count);
const engine = await createOnigurumaEngine(import('shiki/wasm'));
const registry = new Registry({
    onigLib: {
        createOnigScanner: (patterns) => engine.createScanner(patterns),
        createOnigString: (line) => engine.createString(line),
    },
    loadGrammar: () => grammar,
});
const loaded = await registry.loadGrammar(grammar.scopeName);
const lines = source.split('\n');
function tokenize() {
    let state = INITIAL;
    for (const line of lines) state = loaded.tokenizeLine2(line, state).ruleStack;
}
tokenize(); // Compile the active paths equally in the zero-repeat baseline.
const start = process.cpuUsage();
for (let i = 0; i < repeats; i++) tokenize();
const cpu = process.cpuUsage(start);
console.log(JSON.stringify({ variant, shape, targetKiB: size, bytes: Buffer.byteLength(source),
    repeats, cpuMsPerCall: repeats ? (cpu.user + cpu.system) / 1000 / repeats : null }));
