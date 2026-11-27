/**
 * Consecutive definitions share their paragraph verdict. Matching another
 * definition on the next line should not reenter the context validator.
 */
import assert from 'node:assert/strict';
import Prism from 'prismjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');

function cpuMs(source) {
    const start = process.cpuUsage();
    Prism.tokenize(source, Prism.languages.carve);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

function best(source) {
    for (let i = 0; i < 3; i++) cpuMs(source);
    return Math.min(...[0, 1, 2].map(() => cpuMs(source)));
}

for (const unit of ['[a]: /u\n', '*[A]: x\n']) {
    const input = (size) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
    const short = best(input(32768));
    const long = best(input(131072));
    const growth = long / short;
    assert.ok(growth < 5.8, `${JSON.stringify(unit)}: 4x more input cost ${growth.toFixed(2)}x`);
}

console.log('Prism definition runs: near-linear growth');
