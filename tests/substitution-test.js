/**
 * A substitution splits at its first top-level arrow, and each half is inline
 * content; with no such arrow the braces are a forced strikethrough
 * (markup-carve/carve#2092). Masks read off the executable grammar at carve
 * 7bd6577: `D` deleted half, `I` inserted half, `S` strikethrough, `d` a
 * delimiter (either reading allowed), `.` plain.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const prismClass = (leaf) => {
    const path = (leaf.scope ?? '').split('>');
    if (path[0] === 'changed') return path.includes('inserted') ? 'I' : path.includes('deleted') ? 'D' : '.';
    return path[0] === 'forced-strike' ? 'S' : '.';
};
// highlight.js has one theme word for a deletion, so a strikethrough reads `D`.
const hljsClass = (leaf) => (leaf.ancestors.includes('addition') ? 'I' : leaf.ancestors.includes('deletion') ? 'D' : '.');
const textmateClass = (leaf) => {
    const scopes = leaf.scope?.split(' ') ?? [];
    if (scopes.includes('markup.inserted.carve')) return 'I';
    if (scopes.includes('markup.deleted.carve')) return 'D';
    return scopes.includes('markup.strikethrough.carve') ? 'S' : '.';
};

// A link or autolink spanning the arrow stays whole in the deleted half: a
// TextMate or highlight.js rule cannot end a link at its parent's boundary.
const LINK_SPANS_ARROW = new Set(['highlightjs', 'textmate', 'vscode-carve', 'intellij-carve']);

const surfaces = [
    ['prism', prismTokens, prismClass],
    ['highlightjs', hljsTokens, hljsClass],
    ...(await textmateEngines(textmateLineTokenizer)).map(([name, tokenize]) => [name, tokenize, textmateClass]),
];

const rows = [
    ["{~`a~>b~}", 'ddSSSSSdd'],
    ["{~a `x~>y` b~}", 'ddSSSSSSSSSSdd'],
    ["{~`a`~>b~}", 'ddDDDddIdd'],
    ["{~`a~>b~} c", 'ddSSSSSdd..'],
    ["{~a\\~>b~} c", 'ddSSSSSdd..'],
    ["{~a{# ~> #}b~} c", 'ddSSSSSSSSSSdd..'],
    ["{~/old/~>/new/~}", 'ddDDDDDddIIIIIdd'],
    ["{~a\\~>b~}", 'ddSSSSSdd'],
    ["{~$`a~>b`~>c~}", 'ddDDDDDDDddIdd'],
    ["{~!`a~>b`~>c~}", 'ddDDDDDDDddIdd'],
    ["{~a{# ~> #}b~>c~}", 'ddDDDDDDDDDDddIdd'],
    ["{~a~>b~>c~}", 'ddDddIIIIdd'],
    ["{~*a*~>_b_~}", 'ddDDDddIIIdd'],
    ["{~a {% ~> %} b~>c~}", 'ddDDDDDDDDDDDDddIdd'],
    ["{~a~>`x~}`~}", 'ddDddIIIIIdd'],
    ["{~a~>b\\~}c~}", 'ddDddIIIIIdd'],
    ["{~x~}", 'ddSdd'],
    ["{~/a~>b/~}", 'ddDDddIIdd'],
    ["{~a~>b `c~}", 'ddDddIIIIdd'],
    ["{~[x](u~>v)~>c~}", 'ddDDDDDddIIIIIdd', LINK_SPANS_ARROW],
    ["{~<http://a~>b>~>c~}", 'ddDDDDDDDDDddIIIIIdd', LINK_SPANS_ARROW],
    ["{~a~>b~}c", 'ddDddIdd.'],
    ["{~a{#b~>c~}", 'ddDDDDddIdd'],
    ["{~a{# ~> #}b~}", 'ddSSSSSSSSSSdd'],
    ["{~a{%b~>c~}", 'ddDDDDddIdd'],
    ["{~*a~>b*~}", 'ddDDddIIdd'],
    ["{~a~>*b~}*", 'ddDddIIdd.'],
    ["{~_a_ b~>c~}", 'ddDDDDDddIdd'],
    ["{~~~>~}", 'ddDdddd'],
    ["{~a~~>b~}", 'ddDDddIdd'],
    ["{~a~>b~} and {~c~}", 'ddDddIdd.....ddSdd'],
];

let checked = 0;
for (const [name, tokenize, classify] of surfaces) {
    for (const [source, expected, skip] of rows) {
        if (skip?.has(name)) continue;
        let got = '';
        for (const leaf of await tokenize(`${source}\n`)) got += classify(leaf).repeat(leaf.text.length);
        const mask = name === 'highlightjs' ? expected.replaceAll('S', 'D') : expected;
        got = [...mask].map((m, i) => (m === 'd' ? 'd' : got[i])).join('');
        assert.equal(got, mask, `${name}: ${JSON.stringify(source)}`);
        checked++;
    }
}

// A code span still open at the closer ends there.
const isCode = {
    prism: (leaf) => (leaf.scope ?? '').split('>').includes('code'),
    highlightjs: (leaf) => leaf.ancestors.includes('code'),
};
const codeRows = [
    ['{~a~>b `c~}', '`c'],
    ['{~a~>`x~}`~}', '`x~}`'],
];
for (const [name, tokenize] of surfaces) {
    const code = isCode[name] ?? ((leaf) => leaf.scope?.includes('markup.raw.inline'));
    for (const [source, text] of codeRows) {
        const got = (await tokenize(`${source}\n`)).filter(code).map((leaf) => leaf.text).join('');
        assert.equal(got, text, `${name}: code in ${JSON.stringify(source)}`);
        checked++;
    }
}

console.log(`substitution: ${checked} rows across ${surfaces.length} surfaces`);
