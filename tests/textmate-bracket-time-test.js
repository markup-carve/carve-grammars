// Long bracket runs and lines of many links tokenize in linear time in TextMate.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

function cpuMs(source) {
    const start = process.cpuUsage();
    tokenize(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

const run = (unit) => (size) => `${unit.repeat(Math.ceil(size / unit.length))}\n`;
for (const [name, shape] of [
    ['open brackets then link tails', (size) => `${'['.repeat(size / 2)}${']('.repeat(size / 4)}\n`],
    ['footnote reference openers', run('[^')],
    ['inline footnote openers', run('^[')],
    ['links', run('word [l](u) ')],
    ['reference links', run('[x]')],
    ['braced underlines', run('word {_u_} ')],
]) {
    const short = shape(4000);
    const long = shape(32000);
    tokenize(short);
    tokenize(long);

    let ratio = Infinity;
    for (let retry = 0; retry < 3 && ratio >= 3; retry++) {
        const samples = { short: [], long: [] };
        for (let round = 0; round < 4; round++) {
            const order = round % 2 ? [['long', long], ['short', short]] : [['short', short], ['long', long]];
            for (const [size, source] of order) samples[size].push(cpuMs(source));
        }
        ratio = Math.min(...samples.long) / (8 * Math.min(...samples.short));
    }

    assert.ok(ratio < 3, `${name}: tokenization took ${ratio.toFixed(2)} times a linear baseline`);
    console.log(`TextMate ${name}: ${ratio.toFixed(2)} times linear baseline`);
}
