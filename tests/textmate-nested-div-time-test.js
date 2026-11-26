/**
 * TextMate: a run of unclosed div openers costs no more than the tokenizer's
 * own floor for that nesting.
 *
 * Every opener nests (C2-B-119), so after n openers each line sits inside n
 * begin/end rules. vscode-textmate walks the whole rule stack at the start of
 * every line (`_checkWhileConditions`), so a two-rule grammar that only nests
 * is quadratic in the run already, and no grammar can be faster. This test
 * pins the Carve grammar to a constant factor of that floor: its cost over the
 * floor's must not grow with the run.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Registry, INITIAL } from '@shikijs/vscode-textmate';
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma';

const engine = await createOnigurumaEngine(import('shiki/wasm'));
async function load(grammar) {
    const registry = new Registry({
        onigLib: { createOnigScanner: (sources) => engine.createScanner(sources), createOnigString: (source) => engine.createString(source) },
        loadGrammar: () => grammar,
    });
    const loaded = await registry.loadGrammar(grammar.scopeName);
    return (source) => {
        let state = INITIAL;
        for (const line of source.split('\n')) state = loaded.tokenizeLine2(line, state).ruleStack;
    };
}
const carve = await load(JSON.parse(readFileSync(resolve('textmate/carve.tmLanguage.json'), 'utf8')));
const floor = await load({
    scopeName: 'source.nesting-floor',
    patterns: [{ include: '#div' }],
    repository: { div: { begin: '^:::', end: '^;;;', name: 'meta.div', patterns: [{ include: '#div' }] } },
});

function cpuMs(tokenize, source) {
    const start = process.cpuUsage();
    tokenize(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}
const best = (tokenize, source) => Math.min(...[0, 1, 2].map(() => cpuMs(tokenize, source)));

for (const [name, unit] of [['named openers', '::: note\n'], ['anonymous openers', '::: *\n'], ['titled openers', '::: "T"\n']]) {
    const short = unit.repeat(500);
    const long = unit.repeat(2000);
    const floorShort = ':::\n'.repeat(500);
    const floorLong = ':::\n'.repeat(2000);
    carve(short);
    floor(floorShort);

    let growth = Infinity;
    for (let retry = 0; retry < 3 && growth >= 2; retry++) {
        const over = (carveSource, floorSource) => best(carve, carveSource) / best(floor, floorSource);
        growth = over(long, floorLong) / over(short, floorShort);
    }

    assert.ok(growth < 2, `${name}: the cost over the tokenizer floor grew ${growth.toFixed(2)} times from 500 to 2000 openers`);
    console.log(`TextMate unclosed ${name}: ${growth.toFixed(2)} times the nesting floor's growth`);
}
