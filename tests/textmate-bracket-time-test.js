// Long bracket runs and lines of many links, spans and glued attribute blocks tokenize in linear time in TextMate.
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
    ['links with markup in their text', run('a [*b*](u) ')],
    ['links with code and a title', run('a [`c` d](u "t") ')],
    ['reference links with markup', run('a [*b*][r] ')],
    ['spans', run('[a]{.c} ')],
    ['spans with markup and quoted values', run('a [*b*]{k="v"} ')],
    ['glued attribute blocks', (size) => `a${'{.c}'.repeat(size / 4)}\n`],
    ['glued attribute blocks after a span', (size) => `*a*${'{.c}'.repeat(size / 4)}\n`],
    ['glued attribute blocks with quoted values', (size) => `[a](u)${'{k="v}"}'.repeat(size / 8)}\n`],
    ['snippet definition with glued blocks', (size) => `{$v}${'{.c}'.repeat(size / 4)}: X\n`],
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

// A glued block spelled begin/end keeps the scopes of the old match rule (carve-grammars#985).
const scoped = (source) => tokenize(source)
    .filter((token) => token.text.trim())
    .map((token) => `${token.text} ${token.scope.replace(/^source\.carve ?/, '')}`.trim());
const open = '{ meta.attributes.carve punctuation.definition.attributes.carve';
const close = '} meta.attributes.carve punctuation.definition.attributes.carve';
assert.deepEqual(scoped('a{.c}{.d}\n'), ['a', '{.c}', open, '.d meta.attributes.carve entity.other.attribute-name.class.carve', close]);
assert.deepEqual(scoped('*a*{#i k="v}"}\n'), [
    '* punctuation.definition.bold.carve',
    'a markup.bold.carve',
    '* punctuation.definition.bold.carve',
    open,
    '#i meta.attributes.carve entity.other.attribute-name.id.carve',
    'k meta.attributes.carve entity.other.attribute-name.carve',
    '= meta.attributes.carve punctuation.separator.key-value.carve',
    '"v}" meta.attributes.carve string.quoted.carve',
    close,
]);
const snippet = scoped('{$v}{.c}: X\n').map((line) => line.replace('meta.snippet.definition.carve ', ''));
assert.deepEqual(snippet.slice(3, 6), [open, '.c meta.attributes.carve entity.other.attribute-name.class.carve', close]);
console.log('TextMate glued attribute blocks: scopes unchanged');
