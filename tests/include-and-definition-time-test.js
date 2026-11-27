/**
 * Prism, highlight.js and TextMate stay linear on a long line of `{{` openers
 * and on a long run of definitions (carve-grammars#988, #989). Each opener
 * once scanned the rest of its line for a closer, and each definition walked
 * back over the run above it or rescanned it for an emphasis closer.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import { Registry, INITIAL } from '@shikijs/vscode-textmate';
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma';
import carve from '../highlightjs/carve.mjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);

const engine = await createOnigurumaEngine(import('shiki/wasm'));
const grammar = JSON.parse(readFileSync(resolve('textmate/carve.tmLanguage.json'), 'utf8'));
const registry = new Registry({
    onigLib: { createOnigScanner: (sources) => engine.createScanner(sources), createOnigString: (source) => engine.createString(source) },
    loadGrammar: () => grammar,
});
const textmate = await registry.loadGrammar(grammar.scopeName);

const highlighters = {
    prism: (source) => Prism.tokenize(source, Prism.languages.carve),
    hljs: (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true }),
    textmate: (source) => {
        let state = INITIAL;
        for (const line of source.split('\n')) state = textmate.tokenizeLine2(line, state).ruleStack;
    },
};
const units = ['a {{ ', 'a {{ x ', '{{ $w.crv }} ', '{{ a @x:{{ ', '[a]: /u\n', '*[A]: x\n'];

function cpuMs(run, source) {
    const start = process.cpuUsage();
    run(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

for (const [name, run] of Object.entries(highlighters)) {
    for (const unit of units) {
        // An 8x step: the old scans were capped by 4096- and 8192-character
        // windows, which hid them in a 4x step from a short input.
        const short = unit.repeat(Math.ceil(8192 / unit.length));
        const long = short.repeat(8);
        run(short);
        run(long);
        let ratio = Infinity;
        for (let retry = 0; retry < 3 && ratio >= 2.5; retry++) {
            const samples = { short: [], long: [] };
            for (let round = 0; round < 2; round++) {
                const order = round % 2 ? [['long', long], ['short', short]] : [['short', short], ['long', long]];
                for (const [size, source] of order) samples[size].push(cpuMs(run, source));
            }
            ratio = Math.min(...samples.long) / (8 * Math.min(...samples.short));
        }
        assert.ok(ratio < 2.5, `${name} on ${JSON.stringify(unit)} took ${ratio.toFixed(2)} times a linear baseline`);
        // A capped window grows linearly too, so the long input is also held
        // to plain prose of its length: Prism's capped closer scan cost 21
        // times that on a run of definitions.
        const prose = 'a b c '.repeat(Math.ceil(long.length / 6)).slice(0, long.length);
        run(prose);
        let overProse = Infinity;
        for (let retry = 0; retry < 3 && overProse >= 8; retry++) {
            const best = (source) => Math.min(...[0, 1].map(() => cpuMs(run, source)));
            overProse = best(long) / best(prose);
        }
        assert.ok(overProse < 8, `${name} on ${JSON.stringify(unit)} took ${overProse.toFixed(2)} times plain prose of its length`);
    }
}
console.log('include openers and definition runs: linear in Prism, highlight.js and TextMate');
