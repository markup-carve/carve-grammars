/**
 * A glued inline attribute block on a quoted line attaches as it does outside
 * a quote (carve-grammars#865): carve-js renders `> *a*{.q}` as
 * `<blockquote><p><strong class="q">a</strong></p></blockquote>`. Each row is
 * checked at quote depths 1 to 3, and as a lazy line under a quoted one.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

// [line, the block, attaches, surfaces the row does not hold]
const rows = [
    ['*a*{.q}', '{.q}', true],
    ['_a_{.q}', '{.q}', true],
    ['/a/{#i}', '{#i}', true],
    ['{*a*}{k=v}', '{k=v}', true],
    ['x *a*{.q} z', '{.q}', true],
    ['*a*{.q}{#i}', '{#i}', true],
    ['[s]{.q}', '{.q}', true],
    ['[k]{kbd}', '{kbd}', true],
    ['[l](u){.q}', '{.q}', true],
    ['`c`{.q}', '{.q}', true],
    ['- *a*{.q}', '{.q}', true],
    ['a {.c} b', '{.c}', false],
    ['\\*{.c}', '{.c}', false],
    ['`x*{.c}`', '{.c}', false],
    // A `_` that closes no underline (carve-grammars#867 for the other two).
    ['_a_ z_{.c}', '{.c}', false, ['prism', 'highlightjs']],
];

const surfaces = [
    ['prism', prismTokens, (s) => /attributes/.test(s ?? '')],
    // Outside a quote highlight.js keeps a link's block in its `link` span.
    ['highlightjs', hljsTokens, (s) => s === 'attr' || s === 'link'],
    // TextMate scopes a span's `{` as attribute punctuation outside `meta.attributes`.
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, (s) => /meta\.attributes|punctuation\.definition\.attributes/.test(s ?? '')]),
];

const scopeAt = (tokens, at) => {
    let offset = 0;
    return tokens.find((t) => (offset += t.text.length) > at)?.scope;
};

let checked = 0;
for (const [name, tokenize, isAttr] of surfaces) {
    for (const [line, block, attaches, pending = []] of rows) {
        if (pending.includes(name)) continue;
        const sources = ['> ', '> > ', '> > > '].map((prefix) => prefix + line);
        // A lazy line continues the quoted paragraph above it.
        if (!line.startsWith('- ')) sources.push(`> x\n${line}`, `> > x\n${line}`);
        for (const source of sources) {
            const tokens = await tokenize(`${source}\n`);
            const at = source.lastIndexOf(line) + line.indexOf(block);
            assert.equal(isAttr(scopeAt(tokens, at)), attaches, `${name}: ${JSON.stringify(source)} ${attaches ? 'scopes' : 'leaves literal'} ${block}`);
            checked++;
        }
    }
}

console.log(`quoted inline attributes: ${checked} rows across ${surfaces.length} surfaces`);
