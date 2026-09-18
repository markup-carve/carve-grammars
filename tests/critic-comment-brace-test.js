/**
 * An editorial comment's payload is literal, so a `}` inside it does not end
 * it; a `{#` glued to a construct and closed by `}` is an attribute block
 * (carve-grammars#490). Each row was read off the executable grammar at carve
 * 7bd6577: the text scoped as a comment, delimiters included, or null.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const surfaces = [
    ['prism', prismTokens],
    ['highlightjs', hljsTokens],
    ...(await textmateEngines(textmateLineTokenizer)),
];

const rows = [
    ['a {# b} c #} d', '{# b} c #}'],
    ['x{#id} y #} z', '{#id} y #}'],
    ['a {#} b #} c', '{#} b #}'],
    ['*a {# b} c #} d*', '{# b} c #}'],
    ['a {# b #} c', '{# b #}'],
    ['x{#id .c} y', null],
    ['*x*{#id} y #} z', null],
    ['[t]{#id} and #} z', null],
    ['a {##} b', null],
];

let checked = 0;
for (const [name, tokenize] of surfaces) {
    for (const [source, comment] of rows) {
        const scoped = (await tokenize(`${source}\n`))
            .filter((leaf) => /comment/.test(leaf.scope ?? '') || leaf.ancestors?.includes('comment'))
            .map((leaf) => leaf.text)
            .join('');
        assert.equal(scoped || null, comment, `${name}: ${JSON.stringify(source)}`);
        checked++;
    }
}

console.log(`critic comment brace: ${checked} rows across ${surfaces.length} surfaces`);
