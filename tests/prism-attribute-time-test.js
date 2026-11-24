// A long attribute block at a line start tokenizes in linear time in Prism (carve-grammars#951).
import assert from 'node:assert/strict';
import Prism from 'prismjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');

const tokenize = (source) => Prism.tokenize(source, Prism.languages.carve);

function cpuMs(source) {
    const start = process.cpuUsage();
    tokenize(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

for (const [name, shape] of [
    ['block at line start', (a) => `{${a}}`],
    ['block glued to a list marker', (a) => `-{${a}} x`],
    ['block glued to a bare dot', (a) => `.{${a}} . a`],
]) {
    const short = shape('a'.repeat(2000));
    const long = shape('a'.repeat(16000));
    tokenize(short);
    tokenize(long);

    let ratio = Infinity;
    for (let retry = 0; retry < 3 && ratio >= 3; retry++) {
        const samples = { short: [], long: [] };
        for (let round = 0; round < 6; round++) {
            const order = round % 2 ? [['long', long], ['short', short]] : [['short', short], ['long', long]];
            for (const [size, source] of order) samples[size].push(cpuMs(source));
        }
        ratio = Math.min(...samples.long) / (8 * Math.min(...samples.short));
    }

    assert.ok(ratio < 3, `${name}: tokenization took ${ratio.toFixed(2)} times a linear baseline`);
    console.log(`Prism ${name}: ${ratio.toFixed(2)} times linear baseline`);
}
