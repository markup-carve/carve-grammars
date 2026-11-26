/**
 * All three highlighters:
 *
 * - A div name is the longest run of ASCII letters, digits, `_` and `-`, so it
 *   may start with `-` or a digit; the first other character behind it starts
 *   further words (C2-B-119, C2-B-225, `div_name` in data/line-shapes.json).
 * - TextMate splits a quoted div fence line into its parts as an unquoted one,
 *   further words included (C2-B-122), also on a list marker line.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

const KINDS = {
    divName: { prism: ['class-name'], hljs: [], textmate: ['entity.name.tag.admonition.carve'] },
    furtherWords: { prism: ['invalid-metadata'], hljs: [], textmate: ['invalid.illegal.container-metadata.carve'] },
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
            if ((only && !only.includes(name)) || !KINDS[kind][name].length) continue;
            const squash = (text) => text.replace(/\s+/g, '');
            assert.equal(squash(cover(source, KINDS[kind][name])), squash(expected), `${name}: ${kind} in ${JSON.stringify(source)}`);
            count++;
        }
    }
};

// Div names.
check([
    ['::: -x\na\n:::\n', 'divName', '-x'],
    ['::: -\na\n:::\n', 'divName', '-'],
    ['::: 1a\na\n:::\n', 'divName', '1a'],
    ['::: a-b_c\na\n:::\n', 'divName', 'a-b_c'],
    ['::: note-\na\n:::\n', 'divName', 'note-'],
    ['::: -x "T" [L]\na\n:::\n', 'divName', '-x'],
    ['::: -x "T" [L]\na\n:::\n', 'fence', '::: -x "T" [L]:::'],
    ['::: noté\na\n:::\n', 'divName', 'not'],
    ['::: noté\na\n:::\n', 'furtherWords', 'é'],
    ['::: note>\na\n:::\n', 'divName', 'note'],
    ['::: note>\na\n:::\n', 'furtherWords', '>'],
    ['::: éa\na\n:::\n', 'divName', ''],
    ['::: éa\na\n:::\n', 'furtherWords', 'éa'],
    ['- ::: -x\n  a\n  :::\n', 'divName', '-x'],
]);

// Quoted div fence lines in TextMate.
check([
    ['> ::: note junk\n> x\n> :::\n', 'divName', 'note', ['textmate']],
    ['> ::: note junk\n> x\n> :::\n', 'furtherWords', 'junk', ['textmate']],
    ['> ::: -x\n> x\n> :::\n', 'divName', '-x'],
    ['> ::: *\n> x\n> :::\n', 'furtherWords', '*'],
    ['> ::: "T" [L]\n> x\n> :::\n', 'fence', '::: "T" [L]:::'],
    ['> :::x\n', 'fence', ''],
    ['- > ::: note junk\n  > x\n  > :::\n', 'divName', 'note', ['textmate']],
    ['- > ::: note junk\n  > x\n  > :::\n', 'furtherWords', 'junk', ['textmate']],
]);

console.log(`Div names and quoted fences: ${count} assertions passed`);
