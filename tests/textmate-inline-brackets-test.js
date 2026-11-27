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
for (const open of ['^[', ':x[']) {
    for (const body of ['*a', '{#a', '{%a', '*a {#b', '*a {%b']) {
        const source = `${open}${body}] z\nnext\n`;
        assert.equal(covered(tokenize, source, 'string.other.footnote.inline.carve').includes('next'), false, JSON.stringify(source));
        assert.equal(covered(tokenize, source, 'string.unquoted.extension.carve').includes('next'), false, JSON.stringify(source));
    }
    const scope = open === '^[' ? 'string.other.footnote.inline.carve' : 'string.unquoted.extension.carve';
    for (const width of [1, 2, 3, 4, 8, 16]) {
        const ticks = '`'.repeat(width);
        const body = `a [b ${ticks}]${ticks} c]`;
        assert.equal(covered(tokenize, `${open}${body} z\nnext\n`, scope), '', `missing outer closer: ${ticks}`);
        assert.equal(covered(tokenize, `${open}${body}] z\nnext\n`, scope), body, `closed outer bracket: ${ticks}`);
    }
    for (const comment of ['{# ] #}', '{% ] %}']) {
        const body = `a [b ${comment} c]`;
        assert.equal(covered(tokenize, `${open}${body} z\nnext\n`, scope), '', `missing outer closer: ${comment}`);
        assert.equal(covered(tokenize, `${open}${body}] z\nnext\n`, scope), body, `closed outer bracket: ${comment}`);
        const strongBody = `*a ${comment} b*`;
        assert.equal(covered(tokenize, `${open}${strongBody}] z\nnext\n`, scope), strongBody, `closed comment in strong: ${comment}`);
    }
    for (const comment of ['{# \\[b #}', '{% [b %}']) {
        const source = `${open}a ${comment} c]\nnext\n`;
        assert.equal(covered(tokenize, source, scope).includes('next'), false, `comment bracket: ${comment}`);
    }
    for (const destination of ['u', 'u]v']) {
        const source = `${open}*a [b](${destination}) c*]\nnext\n`;
        const tokens = tokenize(source);
        assert.equal(tokens.some(({ scope: tokenScope }) => tokenScope.includes('string.other.link.title.carve')), true, `strong link: ${destination}`);
        assert.equal(covered(tokenize, source, scope).includes('next'), false, `strong link boundary: ${destination}`);
    }
    for (const atom of ['<https://a]b>', '{k="]"}', '[c](u]v)', '[c](u(v]w))', '[c](u "v]w")', "[c](u 'v]w')"]) {
        const body = `a [b ${atom} c]`;
        assert.equal(covered(tokenize, `${open}${body} z\nnext\n`, scope), '', `missing outer closer: ${atom}`);
        assert.equal(covered(tokenize, `${open}${body}] z\nnext\n`, scope), body, `closed outer bracket: ${atom}`);
    }
}
console.log(`TextMate inline bracket bodies: ${count} cases passed`);
