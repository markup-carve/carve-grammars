import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer('textmate/carve.tmLanguage.json');
const hosts = [
    '[a](u)', '[a]{.b}', '*a*', '_a_', '/a/', '~a~', '=a=', '`a`', '<a@b.c>', ':x[a]',
    '(a)', 'foo)', 'a-', 'a+', 'a.', 'a*', 'a_', 'a/', 'a~', 'a=',
];
const attrs = ['{.c}', '{#i}', '{k=v}', '{k="v"}', '{}', '{.c}{.d}', '{2=v}', '{.c }', '{ k=v }', '{.c}\n'];
const prefixes = ['', 'x ', '# ', '> ', '- '];
const scopes = (source) => tokenize(source).reduce((tokens, token) => {
    const last = tokens.at(-1);
    if (last?.scope === token.scope) last.text += token.text;
    else tokens.push({ ...token });
    return tokens;
}, []).map(({ text, scope }) => [text, scope]);
const digest = createHash('sha256');
let count = 0;
for (const host of hosts) for (const attr of attrs) for (const prefix of prefixes) {
    digest.update(JSON.stringify(scopes(`${prefix}${host}${attr}\n`)));
    count++;
}
assert.equal(count, 1000);
assert.equal(digest.digest('hex'), 'b4aeba81a9656e91a86e6cd04b5f73ab5337adec7b555888b399e1776a7efa12');
const sample = tokenize('*b*{.c} [a](u){#i}\n');
assert.equal(sample.filter(({ scope }) => scope.includes('meta.attributes.carve') && scope.includes('punctuation.definition.attributes.carve')).length, 4);
const quotedHeader = tokenize('> |={colspan=2} H |\n> | a | b |');
assert.equal(quotedHeader.some(({ scope, text }) => text === 'colspan' && scope.includes('meta.attributes.carve')), true);
const continuation = tokenize('|= H |\n|={.x} ^ |\n| a |');
assert.equal(continuation.some(({ scope, text }) => text === '.x' && scope.includes('meta.attributes.carve')), false);
for (const source of ['[a](u){.c}[a](u)[a][r]\n', '![a](u){.c}![a](u)[a][r]\n']) {
    assert.equal(tokenize(source).some(({ scope }) => scope.includes('constant.other.reference.link.carve')), true, source);
}
for (const source of ['~`a`~{.c}\n', '~[a](u)~{.c}\n']) {
    assert.equal(tokenize(source).some(({ scope }) => scope.includes('markup.raw.inline.carve') || scope.includes('markup.underline.link.carve')), true, source);
    assert.equal(tokenize(source).some(({ scope }) => scope.includes('meta.attributes.carve')), false, source);
}
assert.equal(tokenize('_a{.x}b_{.c}\n').some(({ scope }) => scope.includes('meta.attributes.carve')), false);
assert.equal(tokenize('_a\\_b_{.c}\n').filter(({ scope }) => scope.includes('meta.attributes.carve')).map(({ text }) => text).join(''), '{.c}');
assert.equal(tokenize('*a * b*{.c}\n').some(({ scope, text }) => text === '.c' && scope.includes('meta.attributes.carve')), true);
for (const source of [
    '[a[b[c[d]]]](u){.x}\n', '[a `]` b](u){.x}\n', '![a[b[c[d]]]](u){.x}\n',
    '[a](){.x}\n', '![a](){.x}\n',
]) {
    assert.equal(tokenize(source).filter(({ scope }) => scope.includes('meta.attributes.carve')).map(({ text }) => text).join(''), '{.x}', source);
}
console.log(`TextMate Phiki attributes: ${count} host variants match prior scopes`);
