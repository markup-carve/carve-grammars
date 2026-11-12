/**
 * Glued attributes after a closer (carve-grammars#882). A bare span holding its
 * own delimiter between two word characters does not form, so a block glued to
 * its last delimiter is text (PART 9 §9 R2); a heading's inline host takes its
 * glued block; a block after punctuation that closes nothing is text. Each row
 * is checked against carve-js too.
 */
import assert from 'node:assert/strict';

import { parse, renderHtml } from '@markup-carve/carve';
import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

// [line, the span forms, the block attaches, surfaces the row does not hold]
const rows = [
    ['*a*b*{.q}', false, false],
    ['_my_var_{.q}', false, false],
    ['/usr/local/{.q}', false, false],
    ['~a~b~{.q}', false, false],
    ['=a=b={.q}', false, false],
    ['*a*b c*{.q}', false, false],
    ['*a*,{.q}', true, false],
    ['*a*.{.q}', true, false],
    ['`c`,{.q}', false, false],
    ['x,{.q}', false, false],
    ['x!{.q}', false, false],
    // Escapes, code spans and links are not the region R2 reads.
    ['*a\\*b*{.q}', true, true],
    ['*x `a*b` y*{.q}', true, true],
    // TextMate's closer lookbehind reads no `*` inside the run (on main too).
    ['*a [b*c](u) d*{.q}', true, true, ['textmate']],
    ['/x `a/b` y/{.q}', true, true],
    ['*a_*b*{.q}', true, true, ['textmate']],
];
const HEADINGS = [
    ['# *a b*{.q}', true],
    ['# `a`{.q}', true],
    ['# [a]{.q}', true],
    ['# _a_{.q}', true],
    ['# {+a+}{.q}', true],
    ['# x :sm:{.q}', true],
    // highlight.js reads no block after a link destination (on main too).
    ['# [a](u){.q}', true, ['highlightjs']],
    ['# *a*b*{.q}', false],
    ['# a*{.q}', false],
    ['# x,{.q}', false],
    ['# H {.q}', false],
    ['# H {#id .q}', false],
];

const surfaces = [
    ['prism', prismTokens, (s) => /attributes/.test(s ?? ''), (s) => /bold|italic|underline|strike|highlight/.test(s ?? '') && !/title/.test(s ?? '')],
    ['highlightjs', hljsTokens, (s) => /\battr\b/.test(s ?? ''), (s) => /strong|emphasis|deletion|addition/.test(s ?? '')],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, (s) => /meta\.attributes/.test(s ?? ''), (s) => /markup\.(bold|italic|underline|strikethrough|highlight)/.test(s ?? '')]),
];

const scopeAt = (tokens, at) => {
    let offset = 0;
    return tokens.find((t) => (offset += t.text.length) > at)?.scope;
};

let failures = 0;
const fail = (message) => {
    failures++;
    console.error(message);
};
const engine = (source) => renderHtml(parse(`${source}\n`));
for (const [line, forms, attaches, pending = []] of rows) {
    for (const prefix of ['', 'x ']) {
        const source = prefix + line;
        const html = engine(source);
        if (/<(strong|em|u|s|mark)[ >]/.test(html) !== forms) fail(`carve-js: ${JSON.stringify(source)} ${forms ? 'forms no' : 'forms a'} span`);
        if (/class="q"/.test(html) !== attaches) fail(`carve-js: ${JSON.stringify(source)} ${attaches ? 'drops' : 'attaches'} the block`);
        for (const [name, tokenize, isAttr, isSpan] of surfaces) {
            if (pending.some((surface) => name.startsWith(surface))) continue;
            const tokens = await tokenize(`${source}\n`);
            if (isAttr(scopeAt(tokens, source.lastIndexOf('.q'))) !== attaches) fail(`${name}: ${JSON.stringify(source)} ${attaches ? 'leaves' : 'scopes'} the block`);
            if (isSpan(scopeAt(tokens, prefix.length + 1)) !== forms) fail(`${name}: ${JSON.stringify(source)} ${forms ? 'scopes no' : 'scopes a'} span`);
        }
    }
}
for (const [source, attaches, pending = []] of HEADINGS) {
    if (/class="q"/.test(engine(source)) !== attaches) fail(`carve-js: ${JSON.stringify(source)} ${attaches ? 'drops' : 'attaches'} the block`);
    for (const [name, tokenize, isAttr] of surfaces) {
        if (pending.some((surface) => name.startsWith(surface))) continue;
        if (isAttr(scopeAt(await tokenize(`${source}\n`), source.lastIndexOf('.q'))) !== attaches) fail(`${name}: ${JSON.stringify(source)} ${attaches ? 'leaves' : 'scopes'} the block`);
    }
}

assert.equal(failures, 0, `${failures} row(s) disagree`);
console.log(`glued attribute after a closer: ${rows.length * 2 + HEADINGS.length} shapes across ${surfaces.length} surfaces and carve-js`);
