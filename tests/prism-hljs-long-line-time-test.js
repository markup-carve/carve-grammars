/**
 * Prism and highlight.js stay linear on one long line of unclosed openers:
 * an emphasis opener's closer scan once rescanned the rest of the line for
 * every `[` or backtick in front of it, and a 100,000-character line hung Prism.
 */
import assert from 'node:assert/strict';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);

const highlighters = {
    prism: (source) => Prism.tokenize(source, Prism.languages.carve),
    hljs: (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true }),
};
const units = ['a *b _c [d ', 'a *b [d ', '/a *b _c {*d [e `f ', '*a `b <c '];

function cpuMs(run, source) {
    const start = process.cpuUsage();
    run(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

for (const [name, run] of Object.entries(highlighters)) {
    for (const unit of units) {
        // Longer than the 8192-character closer window, so both sizes pay it in full.
        const short = unit.repeat(1000);
        const long = short.repeat(4);
        run(short);
        run(long);
        let ratio = Infinity;
        for (let retry = 0; retry < 3 && ratio >= 3; retry++) {
            const samples = { short: [], long: [] };
            for (let round = 0; round < 2; round++) {
                const order = round % 2 ? [['long', long], ['short', short]] : [['short', short], ['long', long]];
                for (const [size, source] of order) samples[size].push(cpuMs(run, source));
            }
            ratio = Math.min(...samples.long) / (4 * Math.min(...samples.short));
        }
        assert.ok(ratio < 3, `${name} on ${JSON.stringify(unit)} took ${ratio.toFixed(2)} times a linear baseline`);
    }
}
console.log('Prism and highlight.js long lines: linear');
