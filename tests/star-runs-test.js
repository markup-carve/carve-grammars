/**
 * Where a bare `*` opens and closes bold, on every surface. Each mask was read
 * off the executable grammar at carve 7bd6577 (carve-grammars#472, #474):
 * `B` is bold content, `d` a delimiter (either reading allowed), `.` plain.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const surfaces = [
    ['prism', prismTokens, (leaf) => leaf.scope?.split('>').includes('bold')],
    ['highlightjs', hljsTokens, (leaf) => leaf.ancestors.includes('strong')],
    ...(await textmateEngines(textmateLineTokenizer)).map(([name, tokenize]) =>
        [name, tokenize, (leaf) => leaf.scope?.split(' ').some((s) => s.startsWith('markup.bold'))]),
];

const rows = [
    ['*a** b', 'dBd...'],
    ['*a**b* c', 'dBd.....'],
    ['*a {% b**c', 'dBBBBBBd..'],
    ['*a {# b**c', 'dBBBBBBd..'],
    ['a *}b', '.....'],
    ['a{*{*x*}*}b', '.ddBBBdd...'],
    ['a *}b* c', '..dBBd..'],
    ['a ** b', '......'],
    ['a **b** c', '.........'],
    ['x *a*}* y', '..dBd....'],
];

let checked = 0;
for (const [name, tokenize, isBold] of surfaces) {
    for (const [source, mask] of rows) {
        let offset = 0;
        const bold = new Array(source.length).fill(false);
        for (const leaf of await tokenize(`${source}\n`)) {
            for (let i = 0; i < leaf.text.length; i++) {
                if (offset + i < source.length) bold[offset + i] = Boolean(isBold(leaf));
            }
            offset += leaf.text.length;
        }
        const got = [...mask].map((m, i) => (m === 'd' ? 'd' : bold[i] ? 'B' : '.')).join('');
        assert.equal(got, mask, `${name}: ${JSON.stringify(source)}`);
        checked++;
    }
}

console.log(`star runs: ${checked} rows across ${surfaces.length} surfaces`);
