/**
 * Link and image destinations read the way the spec's `dest` and `destTitle`
 * productions do (carve-grammars#462). Every row was rendered through the
 * executable grammar at carve c091d01.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

// [source, destination, title]; a null destination means the source is text.
const rows = [
    ['[x](a"b "t")', 'a"b', 't'],
    ['[x]("t")', '"t"', null],
    ["[x](a 't')", 'a', 't'],
    ["![x](a 't')", 'a', 't'],
    ['[x](a(b)c)', 'a(b)c', null],
    [String.raw`[x](a\)b)`, String.raw`a\)b`, null],
    ['[x]()', null, null],
    ['![x]()', null, null],
    ['[x]( "t")', null, null],
    ['[x](/u  "T")', null, null],
];

const surfaces = [
    ['prism', prismTokens, {
        link: (s) => /(^|>)url(>|$)/.test(s ?? ''),
        dest: (t) => /(^|>)url$/.test(t.scope ?? '') && !t.text.startsWith('[') && t.text !== 'x',
        title: (t) => /url>string$/.test(t.scope ?? ''),
        titleText: (title) => new RegExp(`^["']${title}["']$`),
    }],
    ['highlightjs', hljsTokens, { link: (s) => s === 'link' }],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, {
        link: (s) => /link|image/.test(s ?? ''),
        dest: (t) => /markup\.underline\.link/.test(t.scope ?? ''),
        // A link's label is `string.other.link.title` too; every label here is `x`.
        title: (t) => /string\.(other|quoted)\.link\.(description|title)/.test(t.scope ?? '') && t.text !== 'x',
        titleText: (title) => new RegExp(`^${title}$`),
    }]),
];

let checked = 0;
for (const [name, tokenize, is] of surfaces) {
    for (const [source, dest, title] of rows) {
        const tokens = (await tokenize(`${source}\n`)).filter((t) => t.text.trim() !== '');
        const label = `${name}: ${JSON.stringify(source)}`;
        if (dest === null) {
            assert.equal(tokens.some((t) => is.link(t.scope)), false, `${label} is text, not a link`);
            checked++;
            continue;
        }
        if (!is.dest) {
            assert.deepEqual(tokens.map((t) => [t.scope, t.text]), [['link', source]], `${label} is one link`);
            checked++;
            continue;
        }
        assert.deepEqual(tokens.filter(is.dest).map((t) => t.text.trim()), [dest], `${label} destination`);
        const titles = tokens.filter(is.title);
        if (title === null) {
            assert.deepEqual(titles.map((t) => t.text), [], `${label} has no title`);
        } else {
            assert.equal(titles.length, 1, `${label} has one title`);
            assert.match(titles[0].text, is.titleText(title), `${label} title`);
        }
        checked++;
    }
}

console.log(`link destinations: ${checked} rows across ${surfaces.length} surfaces`);
