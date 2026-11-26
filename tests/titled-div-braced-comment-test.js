/**
 * All three highlighters, carve-grammars#972:
 *
 * - A div opener may hold a quoted title, and a label behind it, with no name
 *   before it (C2-B-119); further words follow (C2-B-122). The closer closes it.
 * - A braced comment counts as nothing for its neighbors (C2-I-026), so a bare
 *   delimiter glued through one to word characters forms nothing (C2-I-053),
 *   and a sigil glued through one to the word before it is text (C2-I-090).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';
import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

const KINDS = {
    fence: {
        prism: ['div-delimiter'],
        hljs: ['keyword'],
        textmate: ['punctuation.definition.admonition.carve', 'entity.name.tag.admonition.carve', 'string.quoted.double.admonition.title.carve',
            'constant.other.label.admonition.carve', 'invalid.illegal.container-metadata.carve'],
    },
    title: { prism: ['string'], hljs: [], textmate: ['string.quoted.double.admonition.title.carve'] },
    strong: { prism: ['bold'], hljs: ['strong'], textmate: ['markup.bold.carve', 'punctuation.definition.bold.carve'] },
    emphasis: { prism: ['italic'], hljs: ['emphasis'], textmate: ['markup.italic.carve', 'punctuation.definition.italic.carve'] },
    name: { prism: ['mention', 'tag'], hljs: ['symbol'], textmate: ['punctuation.definition.tag.carve', 'variable.other.tag.carve', 'punctuation.definition.mention.carve', 'variable.other.mention.carve'] },
};

function prismCovered(source, kinds) {
    let out = '';
    const visit = (node, inKind) => {
        if (typeof node === 'string') {
            if (inKind) out += node;
        } else if (Array.isArray(node)) node.forEach((child) => visit(child, inKind));
        else visit(node.content, inKind || kinds.includes(node.type));
    };
    visit(Prism.tokenize(source, Prism.languages.carve), false);
    return out;
}
const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
function hljsCovered(source, kinds) {
    const stack = [];
    let out = '';
    for (const [, open, text] of hljs.highlight(source, { language: 'carve' }).value.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
        if (open !== undefined) stack.push(open);
        else if (text === undefined) stack.pop();
        else if (stack.some((c) => kinds.some((kind) => c.split(' ').includes(`hljs-${kind}`)))) out += unescape(text);
    }
    return out;
}
const textmateCovered = (source, scopes) => tokenize(source)
    .filter((leaf) => leaf.scope.split(' ').some((scope) => scopes.includes(scope)))
    .map((leaf) => leaf.text)
    .join('');
const highlighters = [['prism', prismCovered], ['hljs', hljsCovered], ['textmate', textmateCovered]];

let count = 0;
const check = (rows) => {
    for (const [name, cover] of highlighters) {
        for (const [source, kind, expected, only] of rows) {
            if (!KINDS[kind][name].length || (only && !only.includes(name))) continue;
            const squash = (text) => text.replace(/\s+/g, '');
            assert.equal(squash(cover(source, KINDS[kind][name])), squash(expected), `${name}: ${kind} in ${JSON.stringify(source)}`);
            count++;
        }
    }
};

// A title with no name opens a div; its closer closes it.
check([
    [':::  "T"\nx\n:::\n', 'fence', ':::  "T":::'],
    ['::: "T"\nx\n:::\n', 'fence', '::: "T":::'],
    ['::: "T" [L]\nx\n:::\n', 'fence', '::: "T" [L]:::'],
    ['::: "T" junk\nx\n:::\n', 'fence', '::: "T" junk:::'],
    ['- ::: "T"\n  x\n  :::\n', 'fence', '::: "T":::'],
    [':::: "T"\n::: note\nx\n:::\n::::\n', 'fence', ':::: "T"::: note:::::::'],
    [':::"T"\nx\n', 'fence', ''],
    [':::  "T"\nx\n:::\n', 'title', '"T"'],
    ['::: "a\\"b"\nx\n:::\n', 'title', '"a\\"b"'],
]);

// A braced comment between a delimiter and a word.
check([
    ['*a*{%%}a*\n', 'strong', ''],
    ['*a*{% c %}a\n', 'strong', ''],
    ['*a*{%%}{% x %}b\n', 'strong', ''],
    ['- *a*{%%}a\n', 'strong', ''],
    ['*a*{%%} a\n', 'strong', '*a*'],
    ['*a*{%%}_\n', 'strong', '*a*'],
    ['*a{%%}* b\n', 'strong', '*a{%%}*'],
    // A TextMate lookbehind has a fixed width, so it cannot read a space through a comment.
    ['*a {%%}* b*\n', 'strong', '*a {%%}* b*', ['prism', 'hljs']],
    ['*a {%%}*\n', 'strong', '', ['prism', 'hljs']],
    ['a{%%}*b*\n', 'strong', ''],
    ['a {%%}*b*\n', 'strong', '*b*'],
    ['/a/{%%}a/\n', 'emphasis', ''],
    ['a{%%}/b/\n', 'emphasis', ''],
    ['a{%%}#tag\n', 'name', ''],
    ['a{%%}@bob\n', 'name', ''],
    ['a {%%}#tag\n', 'name', '#tag'],
]);

console.log(`Titled divs and braced comments: ${count} assertions passed`);
