/**
 * An escaped bracket opener is text (carve-grammars#460). Each row was rendered
 * through the executable grammar at carve c091d01; `scoped` says whether the
 * engine produced a link, image, footnote, citation or span there.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const B = '\\';
// [source, scoped]
const rows = [
    [`${B}[x _y](a_)`, false],
    [`${B}[x](u)`, false],
    [`a ${B}[x](u) b`, false],
    [`${B}${B}${B}${B}${B}[x](u)`, false],
    [`${B}[x](u "t")`, false],
    [`!${B}[x](u)`, false],
    [`${B}[x][r]\n\n[r]: /u`, false],
    [`${B}[^1]\n\n[^1]: n`, false],
    [`${B}[x]{.c} b`, false],
    [`${B}[+@key]`, false],
    [`${B}^[n]`, false],
    [`${B}${B}[x](u)`, true],
    [`${B}${B}${B}${B}${B}${B}[x](u)`, true],
    [`${B}![x](u)`, true],
];

// The scope an opened construct carries at its `[`. highlight.js scopes an
// escape as `symbol` too, so only its link and span scopes count; every
// `true` row is a link.
const opens = {
    prism: (scope) => /(^|>)(url|image|footnote|citation|span|inline-footnote)(>|$)/.test(scope ?? ''),
    highlightjs: (scope) => scope === 'link' || scope === 'string',
};
const textmateOpens = (scope) => /link|footnote|citation|span/.test(scope ?? '');

const surfaces = [
    ['prism', prismTokens],
    ['highlightjs', hljsTokens],
    ...await textmateEngines(),
];

let checked = 0;
for (const [name, tokenize] of surfaces) {
    for (const [source, scoped] of rows) {
        const tokens = await tokenize(`${source}\n`);
        const at = source.indexOf('[');
        let offset = 0;
        const token = tokens.find((t) => (offset += t.text.length) > at);
        assert.ok(token, `${name}: ${JSON.stringify(source)} has a token at the bracket`);
        const got = (opens[name] ?? textmateOpens)(token.scope);
        assert.equal(got, scoped, `${name}: ${JSON.stringify(source)} ${scoped ? 'opens' : 'does not open'} at the bracket`);
        checked++;
    }
}

console.log(`escaped openers: ${checked} rows across ${surfaces.length} surfaces`);
