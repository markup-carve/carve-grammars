import assert from 'node:assert/strict';
import { textmateLineTokenizer, covered } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer('textmate/carve.tmLanguage.json');
const has = (source, scope) => covered(tokenize, source, scope);
let variants = 0;

// A caption-shaped line without a caption host is paragraph text. Its lazy
// successor stays under that paragraph at each quoted depth.
for (const depth of [1, 2, 3]) {
    for (const item of ['', '- ']) {
        for (const title of ['c', 'words', '*strong*', '/em/', 'two words', '123', 'a:b', '[link]', 'x_y']) {
            for (const label of ['x', 'abc', 'one-two', 'n1', 'ref', 'long', 'a_b', 'z9', 'note', 'id', 'k', 'u']) {
                const source = `${'> '.repeat(depth)}${item}^ ${title}\n[${label}]: /y\n`;
                assert.equal(has(source, 'meta.link.reference.def.carve'), '', source);
                assert.ok(has(source, 'markup.quote.carve').includes(`[${label}]: /y`), source);
                variants++;
            }
        }
    }
}

const columns = (indent) => {
    let column = 0;
    for (const char of indent) column = char === '\t' ? column + 4 - (column % 4) : column + 1;
    return column;
};
for (const marker of ['-', '1.', 'a)', '- [ ]']) {
    const base = marker.length + 1;
    const continuations = [
        ...Array.from({ length: 6 }, (_, i) => ' '.repeat(base + i + 1)),
        ...Array.from({ length: 3 }, (_, i) => '\t'.repeat(Math.ceil((base + 1) / 4) + i)),
        ...Array.from({ length: 3 }, (_, i) => ' '.repeat(i) + '\t'.repeat(Math.ceil((base + 1) / 4))),
    ];
    for (const title of ['H', 'Title', '*bold*', 'x y']) {
        for (const continuation of continuations) {
            assert.ok(columns(continuation) > base, continuation);
            for (const text of ['more', 'next']) {
                const source = `${marker} a\n\n${' '.repeat(base)}= ${title}\n${continuation}${text}\n`;
                assert.ok(has(source, 'entity.name.section.carve').endsWith(`${continuation}${text}`), source);
                variants++;
            }
        }
    }
}
assert.equal(variants, 1032);

for (const source of [
    '> ^ c\n\n[x]: /y\n',
    '> | a |\n> ^ c\n[x]: /y\n',
]) assert.ok(has(source, 'meta.link.reference.def.carve').includes('[x]: /y'), source);
for (const source of ['- a\n\n  = H\n  more\n', '1. a\n\n   = H\n   more\n']) {
    assert.equal(has(source, 'entity.name.section.carve'), 'H', source);
}
console.log(`TextMate continuation columns: ${variants} variants and 4 boundaries passed`);
