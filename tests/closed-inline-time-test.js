import assert from 'node:assert/strict';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer('textmate/carve.tmLanguage.json');
const short = '/a/ x '.repeat(334);
const long = short.repeat(8);

// Warm the grammar and engine before taking same-process CPU measurements.
tokenize(short);
tokenize(long);

function cpuMs(source) {
    const start = process.cpuUsage();
    tokenize(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

let ratio = Infinity;
for (let retry = 0; retry < 3 && ratio >= 3; retry++) {
    const samples = { short: [], long: [] };
    for (let round = 0; round < 6; round++) {
        const order = round % 2 ? [['long', long], ['short', short]] : [['short', short], ['long', long]];
        for (const [name, source] of order) samples[name].push(cpuMs(source));
    }
    ratio = Math.min(...samples.long) / (8 * Math.min(...samples.short));
}

assert.ok(ratio < 3, `closed inline tokenization took ${ratio.toFixed(2)} times a linear baseline`);
console.log(`Closed inline tokenization: ${ratio.toFixed(2)} times linear baseline`);
