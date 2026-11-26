/**
 * All three highlighters:
 *
 * - A word character is a Unicode letter or number (C2-I-127), so a letter or
 *   digit outside ASCII before a bare opener or a sigil glues it to the word,
 *   and `_` or a combining mark does not (C2-I-047, C2-I-090).
 * - A quoted div opener takes further words as an unquoted one does (C2-B-122).
 * - A run with spaces and anything that is no name, sigil, title or label
 *   behind it opens an anonymous div; a label glued to the run is text (C2-B-119).
 * - A braced comment stays inside its quoted line (C2-I-025).
 * - A hyphen run is a dash also where it opens a word (C2-I-111).
 * - A space before braced comments makes a delimiter no closer (C2-I-026, C2-I-048).
 *
 * The generated word character class of highlight.js matches the categories
 * file of the pinned spec code point by code point.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { CONSTANT, GRAMMAR, wordCharacterSource, wordCodePoints } from '../scripts/word-character-class.mjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

const written = readFileSync(GRAMMAR, 'utf8').match(CONSTANT);
assert.ok(written, 'highlight.js holds the WORD_CHARACTER constant');
assert.equal(written[0].slice(written[1].length, -written[2].length).replaceAll('\\\\', '\\'), wordCharacterSource(),
    'WORD_CHARACTER is current: run node scripts/word-character-class.mjs --write');
{
    const word = new RegExp(`^${wordCharacterSource()}$`);
    const points = wordCodePoints();
    for (let cp = 0; cp <= 0x10ffff; cp++) {
        if (cp >= 0xd800 && cp <= 0xdfff) continue;
        if (word.test(String.fromCodePoint(cp)) !== points.has(cp)) assert.fail(`U+${cp.toString(16)} misread by WORD_CHARACTER`);
    }
}

const KINDS = {
    fence: {
        prism: ['div-delimiter'],
        hljs: ['keyword'],
        textmate: ['punctuation.definition.admonition.carve', 'entity.name.tag.admonition.carve', 'string.quoted.double.admonition.title.carve',
            'constant.other.label.admonition.carve', 'invalid.illegal.container-metadata.carve'],
    },
    quote: { prism: ['blockquote'], hljs: ['quote'], textmate: ['markup.quote.carve'] },
    strong: { prism: ['bold'], hljs: ['strong'], textmate: ['markup.bold.carve', 'punctuation.definition.bold.carve'] },
    emphasis: { prism: ['italic'], hljs: ['emphasis'], textmate: ['markup.italic.carve', 'punctuation.definition.italic.carve'] },
    name: { prism: ['mention', 'tag'], hljs: ['symbol'], textmate: ['punctuation.definition.tag.carve', 'variable.other.tag.carve', 'punctuation.definition.mention.carve', 'variable.other.mention.carve'] },
    dash: { prism: ['typography'], hljs: ['literal'], textmate: ['constant.other.smart_typography.carve'] },
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
            if (only && !only.includes(name)) continue;
            const squash = (text) => text.replace(/\s+/g, '');
            assert.equal(squash(cover(source, KINDS[kind][name])), squash(expected), `${name}: ${kind} in ${JSON.stringify(source)}`);
            count++;
        }
    }
};

// Word characters before an opener or a sigil, through braced comments too.
check([
    ['漢*b*\n', 'strong', ''],
    ['é*b*\n', 'strong', ''],
    ['٣*b*\n', 'strong', ''],
    ['𐐀*b*\n', 'strong', ''],
    ['漢{%%}*b*\n', 'strong', ''],
    ['_*b*\n', 'strong', '*b*'],
    ['x̃*b*\n', 'strong', '*b*'],
    ['😀*b*\n', 'strong', '*b*'],
    ['*b*—\n', 'strong', '*b*'],
    ['漢/b/\n', 'emphasis', ''],
    ['_/b/\n', 'emphasis', '/b/'],
    ['/b/—\n', 'emphasis', '/b/'],
    ['é*/b/*\n', 'strong', ''],
    ['漢{%%}#tag\n', 'name', ''],
    ['漢{%%}@bob\n', 'name', ''],
    ['é#tag\n', 'name', ''],
    ['_#tag\n', 'name', '#tag'],
    ['x̃#tag\n', 'name', '#tag'],
    ['x #a..b\n', 'name', '#a'],
]);

// Quoted div openers with further words, in Prism and highlight.js; TextMate reads a quoted fence line whole.
check([
    ['> ::: "T" junk\n> x\n> :::\n', 'fence', '::: "T" junk:::', ['prism', 'hljs']],
    ['> ::: note junk\n> x\n> :::\n', 'fence', '::: note junk:::', ['prism', 'hljs']],
    ['> ::: note\n> x\n> :::\n', 'fence', '::: note:::', ['prism', 'hljs']],
]);

// Anonymous divs, and a label glued to the run.
check([
    ['::: *\nx\n:::\n', 'fence', '::: *:::'],
    ['::: “T”\nx\n:::\n', 'fence', '::: “T”:::'],
    ['::: "T\nx\n:::\n', 'fence', '::: "T:::'],
    ['::: {.x}\nx\n:::\n', 'fence', '::: {.x}:::'],
    ['::: [x\nx\n:::\n', 'fence', '::: [x:::'],
    ['- ::: *\n  x\n  :::\n', 'fence', '::: *:::'],
    ['::: note\n::: *\nx\n:::\n:::\n', 'fence', '::: note::: *::::::'],
    [':::[x]\ny\n', 'fence', ''],
    ['> ::: *\n> x\n> :::\n', 'fence', '::: *:::', ['prism', 'hljs']],
]);

// A braced comment in a quoted line.
check([
    ['> *a*{%%}a\n', 'quote', '> *a*{%%}a'],
    ['> a {% x %} *b*\n', 'quote', '> a {% x %} *b*'],
    ['> a {% x %} *b*\n', 'strong', '*b*'],
    ['> *a*{%%}a\n', 'strong', ''],
]);

// Dashes.
check([
    ['git log --oneline\n', 'dash', '--'],
    ['x {%%}--a\n', 'dash', '--'],
    ['x "--a\n', 'dash', '--'],
    ['a --. b\n', 'dash', '--'],
]);

// A space before braced comments: no closer. TextMate's strong runs on, as for `*a *`.
check([
    ['*a {%%}* b*\n', 'strong', '*a {%%}* b*'],
    ['/a {%%}/ b/\n', 'emphasis', '/a {%%}/ b/'],
    ['*a {%%}*\n', 'strong', '', ['prism', 'hljs']],
    ['/a {%%}/\n', 'emphasis', ''],
]);

console.log(`Word characters and div openers: ${count} assertions passed`);
