/**
 * highlight.js reads an unclosed bare opener without scanning on for its
 * closer: a `/` in list-item text below `- a` cost a 4096-character search
 * each, twice after a refused definition begin (carve-grammars#1002).
 */
import assert from 'node:assert/strict';

import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

hljs.registerLanguage('carve', carve);

const run = (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true });
const size = 32768;
const doc = (unit) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
const baseline = doc('- a\n');
const shapes = ['- a\n[a]: /u\n', '- :: t\n[a]: /u\n', 'a /u\n', '- a /u *v\n'];

function cpuMs(source) {
    const start = process.cpuUsage();
    run(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

for (const unit of shapes) {
    const source = doc(unit);
    run(source);
    run(baseline);
    let ratio = Infinity;
    for (let retry = 0; retry < 3 && ratio >= 2; retry++) {
        const samples = { shape: [], baseline: [] };
        for (let round = 0; round < 3; round++) {
            const order = round % 2 ? [['baseline', baseline], ['shape', source]] : [['shape', source], ['baseline', baseline]];
            for (const [name, input] of order) samples[name].push(cpuMs(input));
        }
        ratio = Math.min(...samples.shape) / Math.min(...samples.baseline);
    }
    assert.ok(ratio < 2, `${JSON.stringify(unit)} took ${ratio.toFixed(2)} times a plain list of the same size`);
}
console.log('highlight.js unclosed openers: within 2 times a plain list');
