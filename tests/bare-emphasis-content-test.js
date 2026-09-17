/**
 * A bare emphasis run holds inline content, a code span is opaque to its
 * delimiter, and a delimiter of its own kind that cannot close it is text
 * (carve-grammars#473, #475, #476). One mask per kind, read off the executable
 * grammar at carve 7bd6577: `i` italic, `b` bold, `u` underline, `s`
 * strikethrough, `h` highlight, `n` insertion, `c` code or math; `d` is a
 * delimiter (either reading allowed). A kind a row does not list must not
 * appear.
 */
import assert from 'node:assert/strict';

import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const KINDS = 'ibushnc';

const textmateKinds = (leaf) => {
    const scopes = (leaf.scope ?? '').split(' ');
    const has = (name) => scopes.includes(name);
    const kinds = new Set();
    if (has('markup.italic.carve') || has('markup.bold.italic.carve')) kinds.add('i');
    if (has('markup.bold.carve') || has('markup.bold.italic.carve')) kinds.add('b');
    if (has('markup.underline.text.carve')) kinds.add('u');
    if (has('markup.strikethrough.carve') || has('markup.deleted.carve')) kinds.add('s');
    if (has('markup.inserted.carve')) kinds.add('n');
    if (has('markup.highlight.carve')) kinds.add('h');
    if (scopes.some((s) => s.startsWith('markup.raw.inline') || s.startsWith('markup.math'))) kinds.add('c');
    return kinds;
};

const surfaces = (await textmateEngines(textmateLineTokenizer)).map(([name, tokenize]) => [name, tokenize, textmateKinds]);

// Not listed: a bare bold run whose only closer-shaped star sits inside a code
// span colors to the end of its paragraph, since a TextMate begin sees one line.
const rows = [
    ["//a/", {"":"...."}],
    ["/a//", {"i":"did."}],
    ["__a_", {"":"...."}],
    ["_a__", {"u":"dud."}],
    ["*a*_ b", {"b":"dbd..."}],
    ["/a / b/", {"i":"diiiiid"}],
    ["/a \\/b/", {"i":"diidiid"}],
    ["/a `b/", {"c":"...dcc"}],
    ["/a/_ b", {"i":"did..."}],
    ["/a/b/", {"i":"diiid"}],
    ["=a=b=", {"h":"dhhhd"}],
    ["_a_b_", {"u":"duuud"}],
    ["~a~b~", {"s":"dsssd"}],
    ["a *}b", {"":"....."}],
    ["*a *b* c*", {"b":"dbbbbd..."}],
    ["*a {# b* c", {"b":"dbbbbbbd.."}],
    ["*a {*b*} c*", {"b":"dbbbbbd...."}],
    ["/a *b* c/", {"b":"d..dbd..d","i":"diididiid"}],
    ["/a /b/ c/", {"i":"diiiid..."}],
    ["/a {/b/} c/", {"i":"diiiiid...."}],
    ["=a _b_ c=", {"h":"dhhdhdhhd","u":"d..dud..d"}],
    ["~a /b/ c~", {"i":"d..did..d","s":"dssdsdssd"}],
    ["~a {~b~} c~", {"s":"dsssssd...."}],
    ["*a /b* c/ d*", {"b":"dbbbbd......"}],
    ["*a `b* c` d*", {"b":"dbbdbbbbdbbd","c":"d..dccccd..d"}],
    ["/a *b c*d/", {"i":"diiiiiiiid"}],
    ["/a *b/ c* d/", {"i":"diiiid......"}],
    ["/a `b/ c` d/", {"c":"d..dccccd..d","i":"diidiiiidiid"}],
    ["/a {#b/ c#} d/", {"i":"diiddiiiiddiid"}],
    ["/a {% b/ c %} d/", {"i":"diddddddddiddiid"}],
    ["/a {*b/ c*} d/", {"b":"d..ddbbbbdd..d","i":"diiddiiiiddiid"}],
    ["/a {+b/ c+} d/", {"i":"diiddiiiiddiid","n":"d..ddnnnndd..d"}],
    ["/a {^b/ c^} d/", {"i":"diiddiiiiddiid"}],
    ["/a {~b/ c~} d/", {"i":"diiddiiiiddiid","s":"d..ddssssdd..d"}],
    ["*a {/b *c* d/} e*", {"b":"dbbddbbdbdbbddbbd","i":"d..ddiididiidd..d"}],
    ["*a {^b *c* d^} e*", {"b":"dbbddbbdbdbbddbbd"}],
    ["*a [b* c](u) d*", {"b":"dbbdbbbbddddbbd"}],
    ["/a ![b/ c](u) d/", {"i":"didddddidddddiid"}],
    ["/a/é/", {"i":"diiid"}],
    ["_a_é", {"":"...."}],
    ["a <http://x.y/z> b", {"":"..d............d.."}],
    ["a <me@x.y> b", {"":"..d......d.."}],
    ["a <x:a\"> b", {"":"......d..."}],
    ["a <x:a|> b", {"":".........."}],
    ["_a ``x_`` b_", {"c":"d..ddccdd..d","u":"duudduudduud"}],
    ["_a `x_ b", {"c":"...dcccc"}],
    ["_a `x_` b", {"c":"...dccd.."}],
    ["_a `x` b_", {"c":"d..dcd..d","u":"duududuud"}],
    ["a{*{*x*}*}b", {"b":".ddbbbdd..."}],
    ["*bold with /italic/ inside*", {"b":"dbbbbbbbbbbdbbbbbbdbbbbbbbd","i":"d..........diiiiiid.......d"}],
    ["x $$`a b", {"c":"..dddccc"}],
    ["x $`a b", {"c":"..ddccc"}],
];

let checked = 0;
for (const [name, tokenize, classify] of surfaces) {
    for (const [source, masks] of rows) {
        const got = [];
        for (const leaf of await tokenize(`${source}\n`)) {
            for (let i = 0; i < leaf.text.length; i++) got.push(classify(leaf));
        }
        const dontCare = Object.values(masks)[0];
        for (const kind of KINDS) {
            const want = masks[kind] ?? dontCare.replace(/[^d]/g, '.');
            const seen = [...want].map((m, i) => (m === 'd' ? 'd' : got[i]?.has(kind) ? kind : '.')).join('');
            assert.equal(seen, want, `${name}: ${kind} in ${JSON.stringify(source)}`);
        }
        checked++;
    }
}

console.log(`bare emphasis content: ${checked} rows across ${surfaces.length} surfaces`);
