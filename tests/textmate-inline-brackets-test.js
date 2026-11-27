import assert from 'node:assert/strict';

import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer('textmate/carve.tmLanguage.json');
const bodies = [
    '*a*', '{*a [b] c*}', 'a [*b*] c', 'a [b] c', 'a [b](u) c',
    'a [b]{.c} c', '`a ] b` c', 'a \\] b', '{*a [b [c]] d*}', 'a [b [c]] d',
];
const prefixes = ['', 'x ', 'p\n', '> ', '- ', '# ', ':: ', 'a{.c} ', '[z](u) ', '{*p*} '];
const suffixes = ['', ' z', '{.c}', ' [q](u)', ' *z*'];
let count = 0;
for (const [open, scope] of [
    ['^[', 'string.other.footnote.inline.carve'],
    [':x[', 'string.unquoted.extension.carve'],
]) {
    for (const body of bodies) for (const prefix of prefixes) for (const suffix of suffixes) {
        const source = `${prefix}${open}${body}]${suffix}\n`;
        assert.equal(covered(tokenize, source, scope), body, JSON.stringify(source));
        count++;
    }
}
assert.equal(count, 1000);
console.log(`TextMate inline bracket bodies: ${count} cases passed`);
